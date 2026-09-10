import importlib.util
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

    def test_reopen_marks_interrupted_operations_uncertain_without_replay(self):
        self.store.attach_anchor("immutable", "telegram", "owner-chat", "alert")
        self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id="owner-chat",
            message_id="reply",
            anchor_message_id="alert",
            sender_id="owner-user",
            kind="decision",
            body="approve",
        )
        self.store.create_outbound_attempt(
            "attempt-pending", "immutable", "answer", "Owner answer"
        )
        database = self.store.path
        self.store.close()

        self.store = self.module.Storage(database)

        self.assertEqual(
            self.store.receipt_status("telegram", "owner-chat", "reply"),
            "uncertain",
        )
        attempts = self.store.list_outbound_attempts(state="uncertain")
        self.assertEqual([attempt["attempt_id"] for attempt in attempts], ["attempt-pending"])
        self.assertEqual(self.store.get_decision("immutable")["status"], "uncertain")

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
