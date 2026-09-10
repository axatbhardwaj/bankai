import asyncio
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[2]
PLUGIN_ROOT = ROOT / "configs" / "hermes-plugins" / "paseo-review-relay"


def load_plugin():
    entrypoint = PLUGIN_ROOT / "__init__.py"
    if not entrypoint.exists():
        raise AssertionError("Hermes review relay package is not implemented")
    spec = importlib.util.spec_from_file_location(
        "paseo_review_relay",
        entrypoint,
        submodule_search_locations=[str(PLUGIN_ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class FakePaseo:
    def __init__(self):
        self.prompts = []
        self.attempts = []
        self.send_error = None
        self.inspect_error = None
        self.send_server_ids = []
        self.owner = {
            "id": "agent-owner",
            "serverId": "server-vps",
            "archived": False,
        }

    async def inspect_owner(self, agent_id):
        if self.inspect_error:
            raise self.inspect_error
        if self.owner is None:
            return None
        return {"id": agent_id, **self.owner}

    async def send_prompt(self, agent_id, prompt, server_id):
        self.attempts.append((agent_id, prompt))
        self.send_server_ids.append(server_id)
        if self.send_error:
            raise self.send_error
        self.prompts.append((agent_id, prompt))


class FakeGithub:
    def __init__(self):
        self.calls = []
        self.error = None
        self.on_read = None
        self.result = {
            "state": "OPEN",
            "head_sha": "a" * 40,
            "base_sha": "b" * 40,
        }

    async def read_pull_request(self, repository, pr_number):
        self.calls.append((repository, pr_number))
        if self.error:
            raise self.error
        if self.on_read:
            self.on_read()
        return self.result


class FakeTelegram:
    def __init__(self):
        self.messages = []

    async def send(self, chat_id, text, reply_to=None):
        self.messages.append((chat_id, text, reply_to))


class HermesReviewRelayTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.module = load_plugin()
        self.tmp = tempfile.TemporaryDirectory()
        self.store = self.module.Storage(Path(self.tmp.name) / "relay.sqlite3")
        self.store.open_decision(
            decision_id="decision-1",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="acme/widgets",
            pr_number=42,
            head_sha="a" * 40,
            base_sha="b" * 40,
            proposal_digest="c" * 64,
        )
        self.store.attach_anchor("decision-1", "telegram", "owner-chat", "alert-7")
        self.paseo = FakePaseo()
        self.github = FakeGithub()
        self.telegram = FakeTelegram()
        self.tasks = []
        self.relay = self.module.ReviewRelay(
            store=self.store,
            config=self.module.RelayConfig(
                telegram_chat_id="owner-chat",
                telegram_user_id="owner-user",
                server_id="server-vps",
            ),
            paseo=self.paseo,
            github=self.github,
            telegram=self.telegram,
            spawn_task=self.tasks.append,
        )

    def tearDown(self):
        for task in self.tasks:
            if asyncio.iscoroutine(task):
                task.close()
        self.store.close()
        self.tmp.cleanup()

    def event(self, text="Can we keep the old behavior?", message_id="reply-9", **changes):
        source = SimpleNamespace(
            platform="telegram",
            chat_id="owner-chat",
            user_id="owner-user",
            chat_type="dm",
        )
        values = dict(
            source=source,
            text=text,
            message_id=message_id,
            reply_to_message_id="alert-7",
            raw_message=SimpleNamespace(
                from_user=SimpleNamespace(is_bot=False)
            ),
        )
        values.update(changes)
        return SimpleNamespace(**values)

    async def drain(self):
        tasks, self.tasks = self.tasks, []
        await asyncio.gather(*tasks)

    async def test_owner_question_routes_exact_text_to_mapped_agent(self):
        result = self.relay.pre_gateway_dispatch(event=self.event())
        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})

        await self.drain()

        self.assertEqual(
            self.paseo.prompts,
            [
                (
                    "agent-owner",
                    "[telegram-review-relay]\n"
                    "decision_id=decision-1\n"
                    "kind=question\n"
                    "repository=acme/widgets\n"
                    "pr=42\n"
                    f"head={'a' * 40}\n"
                    f"base={'b' * 40}\n"
                    f"proposal_digest={'c' * 64}\n"
                    "text:\nCan we keep the old behavior?",
                )
            ],
        )
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.paseo.send_server_ids, ["server-vps"])
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "forwarded")

    async def test_duplicate_inbound_message_is_not_forwarded_twice(self):
        first = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()
        second = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(first, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(second, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(len(self.paseo.prompts), 1)

    async def test_untrusted_or_unsafe_events_never_schedule_owner_work(self):
        wrong_sender = self.event(message_id="wrong-sender")
        wrong_sender.source = SimpleNamespace(
            platform="telegram",
            chat_id="owner-chat",
            user_id="intruder",
            chat_type="dm",
        )
        wrong_chat = self.event(message_id="wrong-chat")
        wrong_chat.source = SimpleNamespace(
            platform="telegram",
            chat_id="elsewhere",
            user_id="owner-user",
            chat_type="dm",
        )
        group = self.event(message_id="group")
        group.source = SimpleNamespace(
            platform="telegram",
            chat_id="owner-chat",
            user_id="owner-user",
            chat_type="group",
        )
        wrong_platform = self.event(message_id="platform")
        wrong_platform.source.platform = "slack"
        missing_platform = self.event(message_id="missing-platform")
        missing_platform.source = SimpleNamespace(
            chat_id="owner-chat", user_id="owner-user", chat_type="dm"
        )
        bot = SimpleNamespace(is_bot=True)
        unrelated = {
            "wrong platform": wrong_platform,
            "missing platform": missing_platform,
            "wrong chat": wrong_chat,
            "unknown anchor": self.event(message_id="unknown", reply_to_message_id="missing"),
        }
        mapped_but_ineligible = {
            "wrong sender": wrong_sender,
            "group chat": group,
            "missing raw message": self.event(message_id="missing-raw", raw_message=None),
            "forwarded": self.event(message_id="forwarded", raw_message=SimpleNamespace(forward_origin=object())),
            "edited": self.event(message_id="edited", raw_message=SimpleNamespace(edit_date=object())),
            "bot": self.event(message_id="bot", raw_message=SimpleNamespace(from_user=bot)),
            "attachment": self.event(message_id="photo", raw_message=SimpleNamespace(photo=[object()])),
        }

        for name, event in unrelated.items():
            with self.subTest(name=name):
                self.assertIsNone(self.relay.pre_gateway_dispatch(event=event))
        for name, event in mapped_but_ineligible.items():
            with self.subTest(name=name):
                self.assertEqual(
                    self.relay.pre_gateway_dispatch(event=event),
                    {"action": "skip", "reason": "paseo-review-relay"},
                )
        self.assertEqual(self.tasks, [])
        self.assertEqual(self.paseo.prompts, [])

    async def test_closed_decision_is_refused_with_an_expiry_ack(self):
        self.assertTrue(
            hasattr(self.store, "set_decision_status"),
            "storage must expose transport status transitions",
        )
        self.store.set_decision_status("decision-1", "closed")

        result = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.prompts, [])
        self.assertIn("expired", self.telegram.messages[0][1].lower())
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "refused")

    async def test_archived_owner_blocks_the_transport_decision(self):
        self.assertTrue(hasattr(self.store, "get_decision"), "storage must expose decision state")
        self.paseo.owner["archived"] = True

        result = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertIn("owner", self.telegram.messages[0][1].lower())

    async def test_decision_with_live_head_drift_is_refused(self):
        self.github.result["head_sha"] = "d" * 40

        result = self.relay.pre_gateway_dispatch(event=self.event(text="APPROVE"))
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.github.calls, [("acme/widgets", 42)])
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertIn("revision", self.telegram.messages[0][1].lower())
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "refused")

    async def test_exact_decision_is_forwarded_without_changing_transport_state(self):
        result = self.relay.pre_gateway_dispatch(event=self.event(text="reject"))
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.github.calls, [("acme/widgets", 42)])
        self.assertEqual(len(self.paseo.prompts), 1)
        self.assertIn("kind=decision", self.paseo.prompts[0][1])
        self.assertIn("driver_must_revalidate=true", self.paseo.prompts[0][1])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "open")

    async def test_missing_owner_is_blocked_without_a_background_exception(self):
        self.paseo.owner = None

        result = self.relay.pre_gateway_dispatch(event=self.event())
        try:
            await self.drain()
        except Exception as error:
            self.fail(f"missing owner escaped the relay task: {error}")

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertIn("owner", self.telegram.messages[0][1].lower())

    async def test_github_read_failure_is_visible_and_recoverable(self):
        self.github.error = RuntimeError("temporary gh failure")

        result = self.relay.pre_gateway_dispatch(event=self.event(text="hold"))
        try:
            await self.drain()
        except Exception as error:
            self.fail(f"GitHub read failure escaped the relay task: {error}")

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "open")
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "failed")
        self.assertIn("could not validate", self.telegram.messages[0][1].lower())

    async def test_decision_is_rechecked_after_async_external_reads(self):
        self.github.on_read = lambda: self.store.set_decision_status("decision-1", "closed")

        result = self.relay.pre_gateway_dispatch(event=self.event(text="approve"))
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "refused")
        self.assertIn("expired", self.telegram.messages[0][1].lower())

    async def test_ambiguous_forward_is_persisted_and_never_replayed_after_restart(self):
        self.paseo.send_error = self.module.AmbiguousDelivery("timeout after process start")

        result = self.relay.pre_gateway_dispatch(event=self.event())
        try:
            await self.drain()
        except Exception as error:
            self.fail(f"ambiguous delivery escaped the relay task: {error}")

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "uncertain")
        self.assertEqual(self.store.get_decision("decision-1")["status"], "uncertain")
        self.assertIn("uncertain", self.telegram.messages[0][1].lower())
        self.assertIn("not", self.telegram.messages[0][1].lower())

        database = self.store.path
        self.store.close()
        self.store = self.module.Storage(database)
        self.relay.store = self.store
        self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()
        self.assertEqual(len(self.paseo.attempts), 1)

    async def test_demo_decision_token_is_refused_before_github_validation(self):
        self.store.open_decision(
            decision_id="demo",
            owner_agent_id="agent-owner",
            server_id="server-vps",
            repository="__demo__",
            pr_number=0,
            head_sha="0" * 40,
            base_sha="0" * 40,
            proposal_digest="e" * 64,
            demo=True,
        )
        self.store.attach_anchor("demo", "telegram", "owner-chat", "demo-alert")

        result = self.relay.pre_gateway_dispatch(
            event=self.event(text="approve", reply_to_message_id="demo-alert")
        )
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.paseo.prompts, [])
        self.assertEqual(self.store.get_decision("demo")["status"], "open")
        self.assertIn("demo", self.telegram.messages[0][1].lower())

    async def test_stored_server_mismatch_blocks_routing(self):
        self.relay.config = self.module.RelayConfig(
            telegram_chat_id="owner-chat",
            telegram_user_id="owner-user",
            server_id="different-server",
        )

        result = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.attempts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertIn("server", self.telegram.messages[0][1].lower())

    async def test_owner_inspection_failure_is_visible_and_recoverable(self):
        self.paseo.inspect_error = self.module.CommandFailure("paseo inspect exited 1")

        result = self.relay.pre_gateway_dispatch(event=self.event())
        try:
            await self.drain()
        except Exception as error:
            self.fail(f"owner inspection failure escaped the relay task: {error}")

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.attempts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "open")
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "failed")
        self.assertIn("inspect", self.telegram.messages[0][1].lower())

    async def test_server_change_before_send_blocks_the_transport_decision(self):
        self.paseo.send_error = self.module.ServerIdentityMismatch(
            "Paseo server identity changed before send"
        )

        result = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertEqual(
            self.store.receipt_status("telegram", "owner-chat", "reply-9"),
            "refused",
        )
        self.assertIn("server identity", self.telegram.messages[0][1].lower())

    async def test_inspected_owner_id_mismatch_blocks_routing(self):
        self.paseo.owner["id"] = "different-agent"

        result = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(self.paseo.attempts, [])
        self.assertEqual(self.store.get_decision("decision-1")["status"], "blocked")
        self.assertIn("owner", self.telegram.messages[0][1].lower())


if __name__ == "__main__":
    unittest.main()
