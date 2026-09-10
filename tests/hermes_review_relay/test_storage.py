import importlib.util
import multiprocessing
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = ROOT / "configs" / "hermes-plugins" / "paseo-review-relay"


def load_plugin():
    spec = importlib.util.spec_from_file_location(
        "paseo_review_relay",
        PLUGIN_ROOT / "__init__.py",
        submodule_search_locations=[str(PLUGIN_ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def hold_live_operations(database, ready, release, result):
    module = load_plugin()
    store = module.Storage(database)
    store.open_decision(
        decision_id="live-process",
        owner_agent_id="agent-owner",
        server_id="server-vps",
        repository="acme/widgets",
        pr_number=42,
        head_sha="a" * 40,
        base_sha="b" * 40,
        proposal_digest="c" * 64,
    )
    store.attach_anchor("live-process", "telegram", "owner-chat", "alert")
    store.admit_receipt_for_anchor(
        platform="telegram",
        chat_id="owner-chat",
        message_id="reply",
        anchor_message_id="alert",
        sender_id="owner-user",
        kind="question",
        body="Why?",
    )
    store.create_outbound_attempt(
        "live-attempt", "live-process", "answer", "Owner answer"
    )
    ready.set()
    if not release.wait(10):
        os._exit(2)
    try:
        store.mark_receipt("telegram", "owner-chat", "reply", "forwarded")
        store.mark_outbound_sent(
            "live-attempt", "telegram", "owner-chat", "answer-message"
        )
    except Exception as error:
        result.put(f"{type(error).__name__}: {error}")
    else:
        result.put("sent")
    finally:
        store.close()


def abandon_operations(database):
    module = load_plugin()
    store = module.Storage(database)
    store.open_decision(
        decision_id="dead-process",
        owner_agent_id="agent-owner",
        server_id="server-vps",
        repository="acme/widgets",
        pr_number=42,
        head_sha="a" * 40,
        base_sha="b" * 40,
        proposal_digest="c" * 64,
    )
    store.create_outbound_attempt(
        "dead-attempt", "dead-process", "alert", "Pending alert"
    )
    os._exit(0)


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.module = load_plugin()
        self.tmp = tempfile.TemporaryDirectory()
        self.store = self.module.Storage(Path(self.tmp.name) / "relay.sqlite3")
        self.store.open_decision(
            decision_id="immutable",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal_digest="c" * 64,
        )

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_decision_identity_cannot_be_changed_after_insert(self):
        with self.assertRaises(sqlite3.IntegrityError):
            with self.store.connection:
                self.store.connection.execute(
                    "UPDATE decisions SET owner_agent_id = ? WHERE decision_id = ?",
                    ("replacement-agent", "immutable"),
                )

        decision = self.store.get_decision("immutable")
        self.assertEqual(decision["owner_agent_id"], "agent-owner")
        self.store.set_decision_status("immutable", "closed")
        self.assertEqual(self.store.get_decision("immutable")["status"], "closed")

    def test_second_process_does_not_recover_live_operations(self):
        context = multiprocessing.get_context("spawn")
        database = Path(self.tmp.name) / "live.sqlite3"
        ready = context.Event()
        release = context.Event()
        result = context.Queue()
        process = context.Process(
            target=hold_live_operations,
            args=(database, ready, release, result),
        )
        process.start()
        observer = None
        try:
            self.assertTrue(ready.wait(10), "live owner did not create operations")
            observer = self.module.Storage(database)
            self.assertEqual(
                observer.receipt_status("telegram", "owner-chat", "reply"),
                "queued",
            )
            self.assertEqual(
                observer.get_outbound_attempt("live-attempt")["state"], "pending"
            )
            self.assertEqual(
                observer.get_decision("live-process")["status"], "open"
            )
            release.set()
            process.join(10)
            self.assertEqual(process.exitcode, 0)
            self.assertEqual(result.get(timeout=2), "sent")
            self.assertEqual(
                observer.get_outbound_attempt("live-attempt")["state"], "sent"
            )
            decision, admitted = observer.admit_receipt_for_anchor(
                platform="telegram",
                chat_id="owner-chat",
                message_id="reply-to-answer",
                anchor_message_id="answer-message",
                sender_id="owner-user",
                kind="question",
                body="Follow-up",
            )
            self.assertTrue(admitted)
            self.assertEqual(decision["decision_id"], "live-process")
        finally:
            release.set()
            process.join(2)
            if process.is_alive():
                process.terminate()
                process.join(2)
            if observer is not None:
                observer.close()

    def test_dead_process_operations_become_uncertain_without_replay(self):
        context = multiprocessing.get_context("spawn")
        database = Path(self.tmp.name) / "dead.sqlite3"
        process = context.Process(target=abandon_operations, args=(database,))
        process.start()
        process.join(10)
        self.assertEqual(process.exitcode, 0)

        observer = self.module.Storage(database)
        try:
            self.assertEqual(
                observer.get_outbound_attempt("dead-attempt")["state"],
                "uncertain",
            )
            self.assertEqual(
                observer.get_decision("dead-process")["status"], "uncertain"
            )
        finally:
            observer.close()

    def test_pending_snapshot_surfaces_transport_failures(self):
        self.store.attach_anchor("immutable", "telegram", "owner-chat", "alert")
        self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id="owner-chat",
            message_id="reply-failed",
            anchor_message_id="alert",
            sender_id="owner-user",
            kind="question",
            body="Can you retry?",
        )
        self.store.mark_receipt("telegram", "owner-chat", "reply-failed", "failed")
        self.store.create_outbound_attempt(
            "attempt-failed", "immutable", "answer", "Owner answer"
        )
        self.store.mark_outbound_state("attempt-failed", "failed")
        self.assertTrue(
            hasattr(self.store, "pending_snapshot"),
            "storage must expose a recovery snapshot",
        )

        snapshot = self.store.pending_snapshot()

        self.assertEqual([row["decision_id"] for row in snapshot["decisions"]], ["immutable"])
        self.assertEqual(
            [row["message_id"] for row in snapshot["inbound_receipts"]],
            ["reply-failed"],
        )
        self.assertEqual(
            [row["attempt_id"] for row in snapshot["outbound_attempts"]],
            ["attempt-failed"],
        )

    def test_transport_records_include_persistent_timestamps(self):
        decision = self.store.get_decision("immutable")
        self.assertIn("created_at", decision)
        self.assertIn("updated_at", decision)
        self.store.create_outbound_attempt(
            "attempt-time", "immutable", "alert", "Timestamped body"
        )
        attempt = self.store.get_outbound_attempt("attempt-time")
        self.assertIn("created_at", attempt)
        self.assertIn("updated_at", attempt)

    def test_database_is_private_and_uses_wal_transport_storage(self):
        self.assertEqual(self.store.path.stat().st_mode & 0o777, 0o600)
        journal_mode = self.store.connection.execute("PRAGMA journal_mode").fetchone()[0]
        self.assertEqual(journal_mode.lower(), "wal")


if __name__ == "__main__":
    unittest.main()
