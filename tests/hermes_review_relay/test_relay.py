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

    async def inspect_owner(self, agent_id):
        return {"id": agent_id, "serverId": "server-vps", "archived": False}

    async def send_prompt(self, agent_id, prompt):
        self.prompts.append((agent_id, prompt))


class FakeGithub:
    async def read_pull_request(self, repository, pr_number):
        raise AssertionError("questions must not read GitHub")


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

    def event(self, text="Can we keep the old behavior?", message_id="reply-9"):
        source = SimpleNamespace(
            chat_id="owner-chat",
            user_id="owner-user",
            chat_type="dm",
        )
        return SimpleNamespace(
            platform="telegram",
            source=source,
            text=text,
            message_id=message_id,
            reply_to_message_id="alert-7",
            raw_message=None,
        )

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
        self.assertEqual(self.store.receipt_status("telegram", "owner-chat", "reply-9"), "forwarded")

    async def test_duplicate_inbound_message_is_not_forwarded_twice(self):
        first = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()
        second = self.relay.pre_gateway_dispatch(event=self.event())
        await self.drain()

        self.assertEqual(first, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(second, {"action": "skip", "reason": "paseo-review-relay"})
        self.assertEqual(len(self.paseo.prompts), 1)


if __name__ == "__main__":
    unittest.main()
