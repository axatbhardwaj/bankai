import os
import sqlite3
import threading
from functools import wraps
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
        CHECK (status IN ('open', 'superseded', 'closed', 'blocked', 'uncertain')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS anchors (
    platform TEXT NOT NULL,
    chat_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    decision_id TEXT NOT NULL REFERENCES decisions(decision_id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
    owner_token TEXT,
    forward_status TEXT NOT NULL DEFAULT 'queued'
        CHECK (forward_status IN ('queued', 'forwarded', 'refused', 'failed', 'uncertain')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
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
    retry_of TEXT REFERENCES outbound_attempts(attempt_id),
    owner_token TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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


def _process_start_time(pid):
    stat = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8")
    fields = stat.rsplit(") ", 1)[1].split()
    return fields[19]


def _current_owner_token():
    pid = os.getpid()
    return f"{pid}:{_process_start_time(pid)}"


def _owner_is_alive(owner_token):
    if owner_token is None:
        return False
    try:
        raw_pid, expected_start = owner_token.split(":", 1)
        pid = int(raw_pid)
    except (AttributeError, TypeError, ValueError):
        return True
    try:
        return _process_start_time(pid) == expected_start
    except FileNotFoundError:
        return False
    except (IndexError, OSError):
        return True


def _serialized(method):
    @wraps(method)
    def locked(self, *args, **kwargs):
        with self._connection_lock:
            return method(self, *args, **kwargs)

    return locked


class Storage:
    def __init__(self, path):
        self.owner_token = _current_owner_token()
        self._connection_lock = threading.RLock()
        self.path = Path(path)
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.path.parent.chmod(0o700)
        self.connection = sqlite3.connect(self.path, check_same_thread=False)
        self.path.chmod(0o600)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self.connection.execute("PRAGMA journal_mode = WAL")
        self.connection.executescript(SCHEMA)
        self._ensure_owner_columns()
        self._recover_interrupted_operations()

    def _ensure_owner_columns(self):
        with self.connection:
            for table in ("inbound_receipts", "outbound_attempts"):
                columns = {
                    row[1]
                    for row in self.connection.execute(f"PRAGMA table_info({table})")
                }
                if "owner_token" not in columns:
                    self.connection.execute(
                        f"ALTER TABLE {table} ADD COLUMN owner_token TEXT"
                    )

    def _recover_interrupted_operations(self):
        dead_decisions = set()
        with self.connection:
            receipts = self.connection.execute(
                """
                SELECT platform, chat_id, message_id, decision_id, owner_token
                FROM inbound_receipts WHERE forward_status = 'queued'
                """
            ).fetchall()
            for receipt in receipts:
                if _owner_is_alive(receipt["owner_token"]):
                    continue
                cursor = self.connection.execute(
                    """
                    UPDATE inbound_receipts SET
                        forward_status = 'uncertain',
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE platform = ? AND chat_id = ? AND message_id = ?
                        AND forward_status = 'queued'
                    """,
                    (receipt["platform"], receipt["chat_id"], receipt["message_id"]),
                )
                if cursor.rowcount == 1:
                    dead_decisions.add(receipt["decision_id"])
            attempts = self.connection.execute(
                """
                SELECT attempt_id, decision_id, owner_token
                FROM outbound_attempts WHERE state = 'pending'
                """
            ).fetchall()
            for attempt in attempts:
                if _owner_is_alive(attempt["owner_token"]):
                    continue
                cursor = self.connection.execute(
                    """
                    UPDATE outbound_attempts SET
                        state = 'uncertain',
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE attempt_id = ? AND state = 'pending'
                    """,
                    (attempt["attempt_id"],),
                )
                if cursor.rowcount == 1:
                    dead_decisions.add(attempt["decision_id"])
            for decision_id in dead_decisions:
                self.connection.execute(
                    """
                    UPDATE decisions SET
                        status = 'uncertain',
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE decision_id = ? AND status = 'open'
                    """,
                    (decision_id,),
                )

    @_serialized
    def close(self):
        self.connection.close()

    @_serialized
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

    @_serialized
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
                UPDATE decisions SET
                    status = 'superseded',
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
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

    @_serialized
    def attach_anchor(self, decision_id, platform, chat_id, message_id):
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO anchors (platform, chat_id, message_id, decision_id)
                VALUES (?, ?, ?, ?)
                """,
                (platform, str(chat_id), str(message_id), decision_id),
            )

    @_serialized
    def create_outbound_attempt(self, attempt_id, decision_id, kind, body, retry_of=None):
        with self.connection:
            self.connection.execute(
                """
                INSERT INTO outbound_attempts (
                    attempt_id, decision_id, kind, body, retry_of, owner_token
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (attempt_id, decision_id, kind, body, retry_of, self.owner_token),
            )

    @_serialized
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
                UPDATE outbound_attempts SET
                    state = 'sent',
                    message_id = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE attempt_id = ? AND state = 'pending'
                """,
                (str(message_id), attempt_id),
            )
            if cursor.rowcount != 1:
                raise ValueError("outbound attempt is not pending")
            self.connection.execute(
                """
                INSERT INTO anchors (platform, chat_id, message_id, decision_id)
                VALUES (?, ?, ?, ?)
                """,
                (platform, str(chat_id), str(message_id), row["decision_id"]),
            )

    @_serialized
    def mark_outbound_state(self, attempt_id, state):
        if state not in {"failed", "uncertain"}:
            raise ValueError("outbound failure state must be failed or uncertain")
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE outbound_attempts SET
                    state = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE attempt_id = ? AND state = 'pending'
                """,
                (state, attempt_id),
            )
        if cursor.rowcount != 1:
            raise ValueError("outbound attempt is not pending")

    @_serialized
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

    @_serialized
    def get_outbound_attempt(self, attempt_id):
        row = self.connection.execute(
            "SELECT * FROM outbound_attempts WHERE attempt_id = ?",
            (attempt_id,),
        ).fetchone()
        return None if row is None else dict(row)

    @_serialized
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

    @_serialized
    def set_decision_status(self, decision_id, status):
        with self.connection:
            cursor = self.connection.execute(
                """
                UPDATE decisions SET
                    status = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE decision_id = ?
                """,
                (status, decision_id),
            )
        if cursor.rowcount != 1:
            raise KeyError(decision_id)

    @_serialized
    def get_decision(self, decision_id):
        row = self.connection.execute(
            "SELECT * FROM decisions WHERE decision_id = ?",
            (decision_id,),
        ).fetchone()
        return None if row is None else dict(row)

    @_serialized
    def get_decision_for_anchor(self, platform, chat_id, message_id):
        row = self.connection.execute(
            """
            SELECT decisions.* FROM anchors
            JOIN decisions USING (decision_id)
            WHERE platform = ? AND chat_id = ? AND message_id = ?
            """,
            (platform, str(chat_id), str(message_id)),
        ).fetchone()
        return None if row is None else dict(row)

    @_serialized
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
                    platform, chat_id, message_id, decision_id, sender_id, kind,
                    body, owner_token
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    platform,
                    str(chat_id),
                    str(message_id),
                    decision["decision_id"],
                    str(sender_id),
                    kind,
                    body,
                    self.owner_token,
                ),
            )
        return dict(decision), cursor.rowcount == 1

    @_serialized
    def mark_receipt(self, platform, chat_id, message_id, status):
        with self.connection:
            self.connection.execute(
                """
                UPDATE inbound_receipts SET
                    forward_status = ?,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE platform = ? AND chat_id = ? AND message_id = ?
                """,
                (status, platform, str(chat_id), str(message_id)),
            )

    @_serialized
    def receipt_status(self, platform, chat_id, message_id):
        row = self.connection.execute(
            """
            SELECT forward_status FROM inbound_receipts
            WHERE platform = ? AND chat_id = ? AND message_id = ?
            """,
            (platform, str(chat_id), str(message_id)),
        ).fetchone()
        return None if row is None else row["forward_status"]
