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
"""


class Storage:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.connection = sqlite3.connect(self.path)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.executescript(SCHEMA)

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
    ):
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO decisions (
                    decision_id, owner_agent_id, server_id, repository, pr_number,
                    head_sha, base_sha, proposal_digest
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
                ),
            )

    def attach_anchor(self, decision_id, platform, chat_id, message_id):
        with self.connection:
            self.connection.execute(
                "INSERT INTO anchors VALUES (?, ?, ?, ?)",
                (platform, str(chat_id), str(message_id), decision_id),
            )

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
