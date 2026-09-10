import importlib.util
import io
import json
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


class SequencedSender:
    def __init__(self):
        self.next_id = 1

    async def send(self, target, body):
        message_id = f"message-{self.next_id}"
        self.next_id += 1
        return message_id


class CliTests(unittest.TestCase):
    def test_cli_runs_open_answer_supersede_pending_and_close_lifecycle(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "cli_main"), "relay CLI entrypoint is missing")
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "plugin-data"
            data_dir.mkdir()
            old_request = data_dir / "old.json"
            new_request = data_dir / "new.json"
            answer = data_dir / "answer.txt"
            common = {
                "owner_agent_id": "agent-owner",
                "server_id": "server-vps",
                "repository": "acme/widgets",
                "pr_number": 42,
                "base_sha": "b" * 40,
                "consequence": "Session changes",
                "recommendation": "hold",
                "question": "Proceed?",
            }
            old_request.write_text(
                json.dumps(
                    {
                        **common,
                        "decision_id": "old",
                        "head_sha": "a" * 40,
                        "proposal": "Old proposal",
                    }
                ),
                encoding="utf-8",
            )
            new_request.write_text(
                json.dumps(
                    {
                        **common,
                        "decision_id": "new",
                        "head_sha": "c" * 40,
                        "proposal": "New proposal",
                    }
                ),
                encoding="utf-8",
            )
            answer.write_text("One more log is needed.", encoding="utf-8")
            sender = SequencedSender()
            output = io.StringIO()
            kwargs = {
                "data_dir": data_dir,
                "sender": sender,
                "telegram_target": "telegram:owner-chat",
                "output": output,
            }

            self.assertEqual(module.cli_main(["open", "--request-file", str(old_request)], **kwargs), 0)
            self.assertEqual(module.cli_main(["answer", "old", "--file", str(answer)], **kwargs), 0)
            self.assertEqual(
                module.cli_main(
                    ["supersede", "old", "--request-file", str(new_request)], **kwargs
                ),
                0,
            )
            output.seek(0)
            output.truncate(0)
            self.assertEqual(module.cli_main(["pending"], **kwargs), 0)
            snapshot = json.loads(output.getvalue())
            self.assertEqual(
                [decision["decision_id"] for decision in snapshot["decisions"]],
                ["new"],
            )
            self.assertEqual(module.cli_main(["close", "new"], **kwargs), 0)
            output.seek(0)
            output.truncate(0)
            self.assertEqual(module.cli_main(["pending"], **kwargs), 0)
            self.assertEqual(json.loads(output.getvalue())["decisions"], [])


if __name__ == "__main__":
    unittest.main()
