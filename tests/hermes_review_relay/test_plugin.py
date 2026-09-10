import asyncio
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


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


class FakeContext:
    def __init__(self):
        self.hooks = {}
        self.tasks = []

    def register_hook(self, name, callback):
        self.hooks[name] = callback

    def spawn_task(self, coroutine):
        self.tasks.append(coroutine)


class FakeGatewayTelegram:
    def __init__(self):
        self.messages = []

    async def send(self, chat_id, text, reply_to=None):
        self.messages.append((chat_id, text, reply_to))


class FailingPaseo:
    def __init__(self, module):
        self.module = module

    async def inspect_owner(self, agent_id):
        return {"id": agent_id, "serverId": "server-vps", "archived": False}

    async def send_prompt(self, agent_id, prompt):
        raise self.module.CommandFailure("paseo send exited 1")


class PluginRegistrationTests(unittest.TestCase):
    def test_register_installs_only_the_inline_pre_dispatch_hook(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "register"), "Hermes register entrypoint is missing")
        with tempfile.TemporaryDirectory() as tmp:
            hermes_home = Path(tmp) / ".hermes"
            data_dir = hermes_home / "plugin-data" / "paseo-review-relay"
            data_dir.mkdir(parents=True)
            config_path = data_dir / "config.json"
            config_path.write_text(
                json.dumps(
                    {
                        "telegramChatId": "owner-chat",
                        "telegramUserId": "owner-user",
                        "serverId": "server-vps",
                    }
                ),
                encoding="utf-8",
            )
            config_path.chmod(0o600)
            store = module.Storage(data_dir / "relay.sqlite3")
            store.open_decision(
                decision_id="decision-hook",
                owner_agent_id="agent-owner",
                server_id="server-vps",
                repository="acme/widgets",
                pr_number=42,
                head_sha="a" * 40,
                base_sha="b" * 40,
                proposal_digest="c" * 64,
            )
            store.attach_anchor(
                "decision-hook", "telegram", "owner-chat", "telegram-alert"
            )
            store.close()
            context = FakeContext()

            with patch.dict(os.environ, {"HERMES_HOME": str(hermes_home)}, clear=False):
                runtime = module.register(context)
                source = SimpleNamespace(
                    chat_id="owner-chat", user_id="owner-user", chat_type="dm"
                )
                event = SimpleNamespace(
                    platform="telegram",
                    source=source,
                    text="What evidence is missing?",
                    message_id="telegram-reply",
                    reply_to_message_id="telegram-alert",
                    raw_message=None,
                )
                telegram = FakeGatewayTelegram()
                result = context.hooks["pre_gateway_dispatch"](
                    event=event,
                    gateway=SimpleNamespace(adapters={"telegram": telegram}),
                )

            self.assertEqual(list(context.hooks), ["pre_gateway_dispatch"])
            self.assertEqual(result, {"action": "skip", "reason": "paseo-review-relay"})
            self.assertEqual(len(context.tasks), 1)
            self.assertEqual(
                runtime.store.receipt_status(
                    "telegram", "owner-chat", "telegram-reply"
                ),
                "queued",
            )
            runtime.relay.paseo = FailingPaseo(module)
            try:
                asyncio.run(context.tasks[0])
            except Exception as error:
                self.fail(f"registered failure path escaped the relay task: {error}")
            self.assertEqual(
                runtime.store.receipt_status(
                    "telegram", "owner-chat", "telegram-reply"
                ),
                "failed",
            )
            self.assertIn("failed", telegram.messages[0][1].lower())
            runtime.store.close()


if __name__ == "__main__":
    unittest.main()
