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

    async def run(self, argv):
        prompt_path = Path(argv[argv.index("--prompt-file") + 1])
        self.prompt_path = prompt_path
        self.prompt_body = prompt_path.read_text(encoding="utf-8")
        self.prompt_mode = prompt_path.stat().st_mode & 0o777
        self.calls.append(tuple(argv))
        return self.result


class RecordingRunner:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def run(self, argv):
        self.calls.append(tuple(argv))
        return self.result


class SubprocessAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_paseo_prompt_file_contains_text_that_never_enters_argv(self):
        module = load_plugin()
        self.assertTrue(hasattr(module, "PaseoAdapter"), "Paseo subprocess adapter is missing")
        runner = PromptReadingRunner(module.CommandResult(0, "{}", ""))
        adapter = module.PaseoAdapter(runner)
        hostile_text = "approve; $(touch /tmp/not-created)\n`id` && echo pwned"

        await adapter.send_prompt("agent-123", hostile_text)

        self.assertEqual(runner.prompt_body, hostile_text)
        self.assertEqual(runner.prompt_mode, 0o600)
        self.assertEqual(
            runner.calls[0],
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
        self.assertNotIn(hostile_text, runner.calls[0])

    async def test_paseo_inspect_normalizes_owner_and_server_identity(self):
        module = load_plugin()
        payload = {
            "ID": "agent-123",
            "ServerID": "server-vps",
            "Archived": False,
            "Status": "idle",
        }
        runner = RecordingRunner(module.CommandResult(0, json.dumps(payload), ""))
        adapter = module.PaseoAdapter(runner)
        self.assertTrue(hasattr(adapter, "inspect_owner"), "Paseo owner inspection is missing")

        owner = await adapter.inspect_owner("agent-123")

        self.assertEqual(runner.calls, [("paseo", "inspect", "--json", "agent-123")])
        self.assertEqual(
            owner,
            {
                "id": "agent-123",
                "serverId": "server-vps",
                "archived": False,
                "status": "idle",
            },
        )

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


if __name__ == "__main__":
    unittest.main()
