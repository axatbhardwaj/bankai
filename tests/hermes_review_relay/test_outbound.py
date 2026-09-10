import importlib.util
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


class ConfirmingHermes:
    def __init__(self, store, message_id="telegram-alert-77"):
        self.store = store
        self.message_id = message_id
        self.calls = []

    async def send(self, target, body):
        pending = self.store.list_outbound_attempts(state="pending")
        if len(pending) != 1:
            raise AssertionError("outbound attempt was not persisted before send")
        if self.store.get_decision(pending[0]["decision_id"]) is None:
            raise AssertionError("decision was not persisted before send")
        self.calls.append((target, body))
        return self.message_id


class FailingHermes:
    def __init__(self, error):
        self.error = error

    async def send(self, target, body):
        raise self.error


class OutboundDecisionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.module = load_plugin()
        self.tmp = tempfile.TemporaryDirectory()
        self.store = self.module.Storage(Path(self.tmp.name) / "relay.sqlite3")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    async def test_open_persists_before_send_and_anchors_only_confirmed_delivery(self):
        self.assertTrue(hasattr(self.module, "OutboundService"), "outbound service is missing")
        hermes = ConfirmingHermes(self.store)
        service = self.module.OutboundService(
            store=self.store,
            sender=hermes,
            telegram_target="telegram:owner-chat",
        )
        request = self.module.DecisionRequest(
            decision_id="decision-2",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Change the signing policy",
            consequence="Existing sessions must re-authenticate",
            recommendation="approve",
            question="Should the owner proceed?",
        )

        result = await service.open(request)

        self.assertEqual(result["message_id"], "telegram-alert-77")
        self.assertEqual(self.store.get_decision("decision-2")["status"], "open")
        attempts = self.store.list_outbound_attempts(state="sent")
        self.assertEqual(len(attempts), 1)
        self.assertEqual(attempts[0]["message_id"], "telegram-alert-77")
        target, body = hermes.calls[0]
        self.assertEqual(target, "telegram:owner-chat")
        self.assertIn("HUMAN DECISION", body)
        self.assertIn("acme/widgets#42", body)
        self.assertIn("Change the signing policy", body)
        self.assertIn("approve, reject, or hold", body)
        self.assertIn("Anything else is forwarded as a question", body)
        decision, admitted = self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id="owner-chat",
            message_id="owner-reply-1",
            anchor_message_id="telegram-alert-77",
            sender_id="owner-user",
            kind="question",
            body="Why?",
        )
        self.assertTrue(admitted)
        self.assertEqual(decision["decision_id"], "decision-2")

    async def test_ambiguous_alert_send_is_never_anchored_or_replayed(self):
        service = self.module.OutboundService(
            store=self.store,
            sender=FailingHermes(self.module.AmbiguousDelivery("timeout")),
            telegram_target="telegram:owner-chat",
        )
        request = self.module.DecisionRequest(
            decision_id="decision-uncertain",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Change policy",
            consequence="Session changes",
            recommendation="hold",
            question="Proceed?",
        )

        with self.assertRaises(self.module.AmbiguousDelivery):
            await service.open(request)

        attempts = self.store.list_outbound_attempts(state="uncertain")
        self.assertEqual(len(attempts), 1)
        self.assertIsNone(attempts[0]["message_id"])
        self.assertEqual(self.store.get_decision("decision-uncertain")["status"], "uncertain")
        decision, admitted = self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id="owner-chat",
            message_id="reply",
            anchor_message_id="unproven-message",
            sender_id="owner-user",
            kind="question",
            body="Was this sent?",
        )
        self.assertIsNone(decision)
        self.assertFalse(admitted)

    async def test_definite_failure_can_be_retried_as_a_new_attempt(self):
        service = self.module.OutboundService(
            store=self.store,
            sender=FailingHermes(self.module.CommandFailure("exit 1")),
            telegram_target="telegram:owner-chat",
        )
        request = self.module.DecisionRequest(
            decision_id="decision-retry",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Change policy",
            consequence="Session changes",
            recommendation="hold",
            question="Proceed?",
        )
        with self.assertRaises(self.module.CommandFailure):
            await service.open(request)
        failed = self.store.list_outbound_attempts(state="failed")[0]
        service.sender = ConfirmingHermes(self.store)
        self.assertTrue(hasattr(service, "retry_failed"), "explicit retry command is missing")

        result = await service.retry_failed(failed["attempt_id"])

        self.assertEqual(result["message_id"], "telegram-alert-77")
        self.assertEqual(self.store.list_outbound_attempts(state="failed"), [failed])
        sent = self.store.list_outbound_attempts(state="sent")
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0]["retry_of"], failed["attempt_id"])

    async def test_published_answer_becomes_an_anchor_for_the_same_decision(self):
        first_sender = ConfirmingHermes(self.store)
        service = self.module.OutboundService(
            store=self.store,
            sender=first_sender,
            telegram_target="telegram:owner-chat",
        )
        request = self.module.DecisionRequest(
            decision_id="decision-thread",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Change policy",
            consequence="Session changes",
            recommendation="hold",
            question="Proceed?",
        )
        await service.open(request)
        answer_sender = ConfirmingHermes(self.store, "telegram-answer-88")
        service.sender = answer_sender
        self.assertTrue(hasattr(service, "publish_answer"), "answer publishing is missing")

        result = await service.publish_answer("decision-thread", "The owner needs one more log.")

        self.assertEqual(result["message_id"], "telegram-answer-88")
        self.assertIn("PR owner reply", answer_sender.calls[0][1])
        self.assertIn("The owner needs one more log.", answer_sender.calls[0][1])
        decision, admitted = self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id="owner-chat",
            message_id="reply-to-answer",
            anchor_message_id="telegram-answer-88",
            sender_id="owner-user",
            kind="question",
            body="Here it is.",
        )
        self.assertTrue(admitted)
        self.assertEqual(decision["decision_id"], "decision-thread")

    async def test_supersede_closes_old_mapping_and_sends_a_fresh_alert(self):
        service = self.module.OutboundService(
            store=self.store,
            sender=ConfirmingHermes(self.store, "old-alert"),
            telegram_target="telegram:owner-chat",
        )
        old = self.module.DecisionRequest(
            decision_id="decision-old",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Old proposal",
            consequence="Old consequence",
            recommendation="hold",
            question="Old question?",
        )
        await service.open(old)
        service.sender = ConfirmingHermes(self.store, "new-alert")
        new = self.module.DecisionRequest(
            decision_id="decision-new",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="d" * 40,
            base_sha="b" * 40,
            proposal="Revised proposal",
            consequence="New consequence",
            recommendation="approve",
            question="Proceed with the revision?",
        )
        self.assertTrue(hasattr(service, "supersede"), "supersede operation is missing")

        result = await service.supersede("decision-old", new)

        self.assertEqual(result["message_id"], "new-alert")
        self.assertEqual(self.store.get_decision("decision-old")["status"], "superseded")
        self.assertEqual(self.store.get_decision("decision-new")["status"], "open")

    async def test_demo_alert_never_identifies_or_accepts_a_real_pull_request(self):
        self.assertIn(
            "demo",
            self.module.DecisionRequest.__dataclass_fields__,
            "decision requests must label demos explicitly",
        )
        sender = ConfirmingHermes(self.store, "demo-alert")
        service = self.module.OutboundService(
            store=self.store,
            sender=sender,
            telegram_target="telegram:owner-chat",
        )
        request = self.module.DecisionRequest(
            decision_id="decision-demo",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="private/real-repo",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal="Synthetic routing check",
            consequence="No action",
            recommendation="Ask a free-form question",
            question="Does this route?",
            demo=True,
        )

        await service.open(request)

        body = sender.calls[0][1]
        self.assertIn("DEMO", body)
        self.assertNotIn("private/real-repo", body)
        self.assertNotIn("#42", body)
        decision = self.store.get_decision("decision-demo")
        self.assertEqual(decision["repository"], "__demo__")
        self.assertEqual(decision["pr_number"], 0)
        self.assertEqual(decision["demo"], 1)


if __name__ == "__main__":
    unittest.main()
