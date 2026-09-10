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

    def test_doctor_snapshot_is_local_only_and_returns_vps_validation_command(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "doctor_snapshot"), "local doctor helper is missing")
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "plugin-data"
            data_dir.mkdir()
            config = data_dir / "config.json"
            config.write_text(
                json.dumps(
                    {
                        "telegramChatId": "owner-chat",
                        "telegramUserId": "owner-user",
                        "serverId": "server-vps",
                    }
                ),
                encoding="utf-8",
            )
            config.chmod(0o600)
            store = module.Storage(data_dir / "relay.sqlite3")
            store.open_decision(
                decision_id="doctor-pending",
                owner_agent_id="agent-owner",
                server_id="server-vps",
                repository="acme/widgets",
                pr_number=42,
                head_sha="a" * 40,
                base_sha="b" * 40,
                proposal_digest="c" * 64,
            )
            store.create_outbound_attempt(
                "pending-attempt", "doctor-pending", "alert", "Pending alert"
            )
            looked_up = []

            def find_command(name):
                looked_up.append(name)
                return f"/usr/bin/{name}"

            snapshot = module.doctor_snapshot(data_dir, command_finder=find_command)

            self.assertEqual(looked_up, ["hermes", "paseo", "gh"])
            self.assertEqual(snapshot["database"], "ok")
            self.assertEqual(snapshot["config"], "private")
            self.assertEqual(
                snapshot["vps_validation_command"],
                "hermes plugins doctor /root/.hermes/plugins/paseo-review-relay --ci",
            )
            self.assertEqual(
                store.get_outbound_attempt("pending-attempt")["state"], "pending"
            )
            self.assertEqual(store.get_decision("doctor-pending")["status"], "open")
            store.close()

    def test_doctor_rejects_the_shipped_placeholder_config(self):
        module = load_plugin()
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp) / "plugin-data"
            data_dir.mkdir()
            config = data_dir / "config.json"
            config.write_text(
                (PLUGIN_ROOT / "config.example.json").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            config.chmod(0o600)

            with self.assertRaisesRegex(ValueError, "placeholder"):
                module.doctor_snapshot(data_dir)


if __name__ == "__main__":
    unittest.main()
