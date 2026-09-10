import sqlite3
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS decisions (
    decision_id TEXT PRIMARY KEY,
    owner_agent_id TEXT NOT NULL,
    server_id TEXT NOT NULL,
    repository TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    head_sha TEXT NOT NULL,
    base_sha TEXT NOT NULL,
    proposal_digest TEXT NOT NULL,
    demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'superseded', 'closed', 'blocked', 'uncertain'))
);
CREATE TABLE IF NOT EXISTS anchors (
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    decision_id TEXT NOT NULL REFERENCES decisions(decision_id),
    PRIMARY KEY (platform, chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS inbound_receipts (
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    decision_id TEXT NOT NULL REFERENCES decisions(decision_id),
    sender_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('question', 'decision')),
    body TEXT NOT NULL,
    forward_status TEXT NOT NULL DEFAULT 'queued'
        CHECK (forward_status IN ('queued', 'forwarded', 'refused', 'failed', 'uncertain')),
    PRIMARY KEY (platform, chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS outbound_attempts (
    attempt_id TEXT PRIMARY KEY,
    decision_id TEXT NOT NULL REFERENCES decisions(decision_id),
    kind TEXT NOT NULL CHECK (kind IN ('alert', 'answer')),
    body TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'sent', 'failed', 'uncertain')),
    message_id TEXT,
    retry_of TEXT REFERENCES outbound_attempts(attempt_id)
);
CREATE TRIGGER IF NOT EXISTS decisions_identity_is_immutable
BEFORE UPDATE OF
    decision_id, owner_agent_id, server_id, repository, pr_number,
    head_sha, base_sha, proposal_digest, demo
ON decisions
BEGIN
    SELECT RAISE(ABORT, 'decision identity is immutable');
END;
"""


class Storage:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.executescript(SCHEMA)
        self._recover_interrupted_operations()

    def _recover_interrupted_operations(self):
        with self.connection:
            self.connection.execute(
                """
                UPDATE decisions SET status = 'uncertain'
                WHERE status = 'open' AND decision_id IN (
                    SELECT decision_id FROM inbound_receipts WHERE forward_status = 'queued'
                    UNION
                    SELECT decision_id FROM outbound_attempts WHERE state = 'pending'
                )
                """
            )
            self.connection.execute(
                "UPDATE inbound_receipts SET forward_status = 'uncertain' WHERE forward_status = 'queued'"
            )
            self.connection.execute(
                "UPDATE outbound_attempts SET state = 'uncertain' WHERE state = 'pending'"
            )

    def close(self):
        self.connection.close()

    def open_decision(
        self,
        *,
        decision_id,
        owner_agent_id,
        server_id,
        repository,
        pr_number,
        head_sha,
        base_sha,
        proposal_digest,
        demo=False,
    ):
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO decisions (
                    decision_id, owner_agent_id, server_id, repository, pr_number,
                    head_sha, base_sha, proposal_digest, demo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    decision_id,
                    owner_agent_id,
                    server_id,
                    repository,
                    pr_number,
                    head_sha,
                    base_sha,
                    proposal_digest,
                    int(demo),
                ),
            )

    def supersede_decision(
        self,
        old_decision_id,
        *,
        decision_id,
        owner_agent_id,
        server_id,
        repository,
        pr_number,
        head_sha,
        base_sha,
        proposal_digest,
        demo=False,
    ):
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE decisions SET status = 'superseded'
                WHERE decision_id = ? AND status = 'open'
                """,
                (old_decision_id,),
            )
            if cursor.rowcount != 1:
                raise ValueError("only an open decision may be superseded")
            self.connection.execute(
                """
                INSERT INTO decisions (
                    decision_id, owner_agent_id, server_id, repository, pr_number,
                    head_sha, base_sha, proposal_digest, demo
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    decision_id,
                    owner_agent_id,
                    server_id,
                    repository,
                    pr_number,
                    head_sha,
                    base_sha,
                    proposal_digest,
                    int(demo),
                ),
            )

    def attach_anchor(self, decision_id, platform, chat_id, message_id):
        with self.connection:
            self.connection.execute(
                "INSERT INTO anchors VALUES (?, ?, ?, ?)",
                (platform, str(chat_id), str(message_id), decision_id),
            )

    def create_outbound_attempt(self, attempt_id, decision_id, kind, body, retry_of=None):
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO outbound_attempts (
                    attempt_id, decision_id, kind, body, retry_of
                ) VALUES (?, ?, ?, ?, ?)
                """,
                (attempt_id, decision_id, kind, body, retry_of),
            )

    def mark_outbound_sent(self, attempt_id, platform, chat_id, message_id):
        with self.connection:
            row = self.connection.execute(
                "SELECT decision_id FROM outbound_attempts WHERE attempt_id = ?",
                (attempt_id,),
            ).fetchone()
            if row is None:
                raise KeyError(attempt_id)
            cursor = self.connection.execute(
                """
                UPDATE outbound_attempts SET state = 'sent', message_id = ?
                WHERE attempt_id = ? AND state = 'pending'
                """,
                (str(message_id), attempt_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("outbound attempt is not pending")
            self.connection.execute(
                "INSERT INTO anchors VALUES (?, ?, ?, ?)",
                (platform, str(chat_id), str(message_id), row["decision_id"]),
            )

    def mark_outbound_state(self, attempt_id, state):
        if state not in {"failed", "uncertain"}:
            raise ValueError("outbound failure state must be failed or uncertain")
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE outbound_attempts SET state = ?
                WHERE attempt_id = ? AND state = 'pending'
                """,
                (state, attempt_id),
            )
        if cursor.rowcount != 1:
            raise ValueError("outbound attempt is not pending")

    def list_outbound_attempts(self, *, state=None):
        if state is None:
            rows = self.connection.execute(
                "SELECT * FROM outbound_attempts ORDER BY rowid"
            ).fetchall()
        else:
            rows = self.connection.execute(
                "SELECT * FROM outbound_attempts WHERE state = ? ORDER BY rowid",
                (state,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_outbound_attempt(self, attempt_id):
        row = self.connection.execute(
            "SELECT * FROM outbound_attempts WHERE attempt_id = ?",
            (attempt_id,),
        ).fetchone()
        return None if row is None else dict(row)

    def pending_snapshot(self):
        decisions = self.connection.execute(
            """
            SELECT * FROM decisions
            WHERE status IN ('open', 'blocked', 'uncertain')
            ORDER BY rowid
            """
        ).fetchall()
        inbound = self.connection.execute(
            """
            SELECT * FROM inbound_receipts
            WHERE forward_status IN ('queued', 'failed', 'uncertain')
            ORDER BY rowid
            """
        ).fetchall()
        outbound = self.connection.execute(
            """
            SELECT * FROM outbound_attempts
            WHERE state IN ('pending', 'failed', 'uncertain')
            ORDER BY rowid
            """
        ).fetchall()
        return {
            "decisions": [dict(row) for row in decisions],
            "inbound_receipts": [dict(row) for row in inbound],
            "outbound_attempts": [dict(row) for row in outbound],
        }

    def set_decision_status(self, decision_id, status):
        with self.connection:
            cursor = self.connection.execute(
                "UPDATE decisions SET status = ? WHERE decision_id = ?",
                (status, decision_id),
            )
        if cursor.rowcount != 1:
            raise KeyError(decision_id)

    def get_decision(self, decision_id):
        row = self.connection.execute(
            "SELECT * FROM decisions WHERE decision_id = ?",
            (decision_id,),
        ).fetchone()
        return None if row is None else dict(row)

    def admit_receipt_for_anchor(
        self,
        *,
        platform,
        chat_id,
        message_id,
        anchor_message_id,
        sender_id,
        kind,
        body,
    ):
        with self.connection:
            decision = self.connection.execute(
                """
                SELECT decisions.* FROM anchors
                JOIN decisions USING (decision_id)
                WHERE platform = ? AND chat_id = ? AND message_id = ?
                """,
                (platform, str(chat_id), str(anchor_message_id)),
            ).fetchone()
            if decision is None:
                return None, False
            cursor = self.connection.execute(
                """
                INSERT OR IGNORE INTO inbound_receipts (
                    platform, chat_id, message_id, decision_id, sender_id, kind, body
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    platform,
                    str(chat_id),
                    str(message_id),
                    decision["decision_id"],
                    str(sender_id),
                    kind,
                    body,
                ),
            )
        return dict(decision), cursor.rowcount == 1

    def mark_receipt(self, platform, chat_id, message_id, status):
        with self.connection:
            self.connection.execute(
                """
                UPDATE inbound_receipts SET forward_status = ?
                WHERE platform = ? AND chat_id = ? AND message_id = ?
                """,
                (status, platform, str(chat_id), str(message_id)),
            )

    def receipt_status(self, platform, chat_id, message_id):
        row = self.connection.execute(
            """
            SELECT forward_status FROM inbound_receipts
            WHERE platform = ? AND chat_id = ? AND message_id = ?
            """,
            (platform, str(chat_id), str(message_id)),
        ).fetchone()
        return None if row is None else row["forward_status"]
