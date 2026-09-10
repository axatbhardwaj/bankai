import importlib.util
import json
import sys
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


class PromptReadingRunner:
    def __init__(self, result):
        self.result = result
        self.calls = []
        self.prompt_body = None
        self.prompt_mode = None
        self.prompt_path = None
        self.environments = []

    async def run(self, argv, *, env=None):
        self.calls.append(tuple(argv))
        self.environments.append(env)
        if argv == ["paseo", "status", "--json"]:
            return self.result.__class__(
                0,
                json.dumps(
                    {
                        "serverId": "server-vps",
                        "localDaemon": "running",
                        "connectedDaemon": "reachable",
                        "listen": "127.0.0.1:6767",
                    }
                ),
                "",
            )
        prompt_path = Path(argv[argv.index("--prompt-file") + 1])
        self.prompt_path = prompt_path
        self.prompt_body = prompt_path.read_text(encoding="utf-8")
        self.prompt_mode = prompt_path.stat().st_mode & 0o777
        return self.result


class MessageReadingRunner:
    def __init__(self, result):
        self.result = result
        self.calls = []
        self.message_body = None
        self.message_mode = None
        self.message_path = None

    async def run(self, argv, *, env=None):
        message_path = Path(argv[argv.index("--file") + 1])
        self.message_path = message_path
        self.message_body = message_path.read_text(encoding="utf-8")
        self.message_mode = message_path.stat().st_mode & 0o777
        self.calls.append(tuple(argv))
        return self.result


class RecordingRunner:
    def __init__(self, result):
        self.result = result
        self.calls = []
        self.environments = []

    async def run(self, argv, *, env=None):
        self.calls.append(tuple(argv))
        self.environments.append(env)
        return self.result


class SequencedRunner:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []
        self.environments = []

    async def run(self, argv, *, env=None):
        self.calls.append(tuple(argv))
        self.environments.append(env)
        return next(self.results)


class SubprocessAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_paseo_prompt_file_contains_text_that_never_enters_argv(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "PaseoAdapter"), "Paseo subprocess adapter is missing")
        runner = PromptReadingRunner(module.CommandResult(0, "{}", ""))
        adapter = module.PaseoAdapter(
            runner,
            environment={
                "PATH": "/usr/bin",
                "PASEO_HOME": "/private/local-paseo-home",
                "PASEO_HOST": "ssh://remote-daemon",
            },
        )
        hostile_text = "approve; $(touch /tmp/not-created)\n`id` && echo pwned"

        await adapter.send_prompt("agent-123", hostile_text, "server-vps")

        self.assertEqual(runner.prompt_body, hostile_text)
        self.assertEqual(runner.prompt_mode, 0o600)
        self.assertEqual(
            runner.calls[1],
            (
                "paseo",
                "send",
                "agent-123",
                "--prompt-file",
                str(runner.prompt_path),
                "--no-wait",
            ),
        )
        self.assertFalse(runner.prompt_path.exists())
        self.assertNotIn(hostile_text, runner.calls[1])
        expected_environment = {
            "PATH": "/usr/bin",
            "PASEO_HOME": "/private/local-paseo-home",
        }
        self.assertEqual(
            runner.environments, [expected_environment, expected_environment]
        )

    async def test_paseo_calls_remove_only_the_remote_host_override(self):
        module = load_plugin()
        status = {
            "serverId": "server-vps",
            "localDaemon": "running",
            "connectedDaemon": "reachable",
            "listen": "127.0.0.1:6767",
        }
        owner = {"Id": "agent-123", "Archived": False, "Status": "idle"}
        runner = SequencedRunner(
            [
                module.CommandResult(0, json.dumps(status), ""),
                module.CommandResult(0, json.dumps(owner), ""),
            ]
        )
        inherited = {
            "PATH": "/usr/bin",
            "PASEO_HOME": "/private/local-paseo-home",
            "PASEO_HOST": "ssh://remote-daemon",
        }
        adapter = module.PaseoAdapter(runner, environment=inherited)

        await adapter.inspect_owner("agent-123")

        expected = {
            "PATH": "/usr/bin",
            "PASEO_HOME": "/private/local-paseo-home",
        }
        self.assertEqual(runner.environments, [expected, expected])
        self.assertEqual(inherited["PASEO_HOST"], "ssh://remote-daemon")

    async def test_paseo_inspect_normalizes_owner_and_server_identity(self):
        module = load_plugin()
        status = {
            "serverId": "server-vps",
            "localDaemon": "running",
            "connectedDaemon": "reachable",
            "listen": "127.0.0.1:6767",
        }
        owner_payload = {
            "Id": "agent-123",
            "Archived": False,
            "Status": "idle",
        }
        runner = SequencedRunner(
            [
                module.CommandResult(0, json.dumps(status), ""),
                module.CommandResult(0, json.dumps(owner_payload), ""),
            ]
        )
        adapter = module.PaseoAdapter(runner)
        self.assertTrue(hasattr(adapter, "inspect_owner"), "Paseo owner inspection is missing")

        owner = await adapter.inspect_owner("agent-123")

        self.assertEqual(
            runner.calls,
            [
                ("paseo", "status", "--json"),
                ("paseo", "inspect", "--json", "agent-123"),
            ],
        )
        self.assertEqual(
            owner,
            {
                "id": "agent-123",
                "serverId": "server-vps",
                "archived": False,
                "status": "idle",
            },
        )

    async def test_paseo_send_revalidates_the_local_server_before_delivery(self):
        module = load_plugin()
        status = {
            "serverId": "other-server",
            "localDaemon": "running",
            "connectedDaemon": "reachable",
            "listen": "127.0.0.1:6767",
        }
        runner = RecordingRunner(module.CommandResult(0, json.dumps(status), ""))
        adapter = module.PaseoAdapter(runner)

        with self.assertRaisesRegex(module.CommandFailure, "server identity"):
            await adapter.send_prompt("agent-123", "owner text", "server-vps")

        self.assertEqual(runner.calls, [("paseo", "status", "--json")])

    async def test_paseo_inspect_rejects_missing_server_identity(self):
        module = load_plugin()
        status = {
            "localDaemon": "running",
            "connectedDaemon": "reachable",
            "listen": "127.0.0.1:6767",
        }
        runner = RecordingRunner(module.CommandResult(0, json.dumps(status), ""))

        with self.assertRaisesRegex(module.CommandFailure, "status"):
            await module.PaseoAdapter(runner).inspect_owner("agent-123")

        self.assertEqual(runner.calls, [("paseo", "status", "--json")])

    async def test_paseo_inspect_rejects_missing_owner_identity(self):
        module = load_plugin()
        status = {
            "serverId": "server-vps",
            "localDaemon": "running",
            "connectedDaemon": "reachable",
            "listen": "127.0.0.1:6767",
        }
        owner = {"Archived": False, "Status": "idle"}
        runner = SequencedRunner(
            [
                module.CommandResult(0, json.dumps(status), ""),
                module.CommandResult(0, json.dumps(owner), ""),
            ]
        )

        with self.assertRaisesRegex(module.CommandFailure, "invalid JSON"):
            await module.PaseoAdapter(runner).inspect_owner("agent-123")

    async def test_github_adapter_reads_exact_live_head_and_base(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "GithubAdapter"), "GitHub subprocess adapter is missing")
        payload = {
            "state": "OPEN",
            "headRefOid": "a" * 40,
            "baseRefOid": "b" * 40,
        }
        runner = RecordingRunner(module.CommandResult(0, json.dumps(payload), ""))

        pull_request = await module.GithubAdapter(runner).read_pull_request("acme/widgets", 42)

        self.assertEqual(
            runner.calls,
            [
                (
                    "gh",
                    "pr",
                    "view",
                    "42",
                    "--repo",
                    "acme/widgets",
                    "--json",
                    "state,headRefOid,baseRefOid",
                )
            ],
        )
        self.assertEqual(
            pull_request,
            {"state": "OPEN", "head_sha": "a" * 40, "base_sha": "b" * 40},
        )

    async def test_async_runner_executes_an_argument_array_without_a_shell(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "AsyncCommandRunner"), "async subprocess runner is missing")

        result = await module.AsyncCommandRunner(timeout=2).run(
            [sys.executable, "-c", "print('relay-ok')"]
        )

        self.assertEqual(result, module.CommandResult(0, "relay-ok\n", ""))

    async def test_async_runner_uses_the_explicit_environment(self):
        module = load_plugin()
        result = await module.AsyncCommandRunner(timeout=2).run(
            [
                sys.executable,
                "-c",
                "import os; print(os.getenv('PASEO_HOST', 'missing')); "
                "print(os.getenv('PASEO_HOME', 'missing'))",
            ],
            env={"PATH": "/usr/bin", "PASEO_HOME": "/private/local-paseo-home"},
        )

        self.assertEqual(
            result,
            module.CommandResult(
                0, "missing\n/private/local-paseo-home\n", ""
            ),
        )

    async def test_hermes_sender_anchors_only_json_confirmed_message_id(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "HermesAdapter"), "Hermes sender adapter is missing")
        runner = MessageReadingRunner(
            module.CommandResult(0, json.dumps({"message_id": 991}), "")
        )
        sender = module.HermesAdapter(runner)
        body = "Owner answer with ; $(commands) and `backticks`"

        message_id = await sender.send("telegram:owner-chat", body)

        self.assertEqual(message_id, "991")
        self.assertEqual(runner.message_body, body)
        self.assertEqual(runner.message_mode, 0o600)
        self.assertEqual(
            runner.calls,
            [
                (
                    "hermes",
                    "send",
                    "--to",
                    "telegram:owner-chat",
                    "--file",
                    str(runner.message_path),
                    "--json",
                )
            ],
        )
        self.assertFalse(runner.message_path.exists())
        self.assertNotIn(body, runner.calls[0])


if __name__ == "__main__":
    unittest.main()
