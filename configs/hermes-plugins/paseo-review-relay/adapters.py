import asyncio
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str
    stderr: str


class CommandFailure(RuntimeError):
    pass


class AmbiguousDelivery(RuntimeError):
    pass


class AsyncCommandRunner:
    def __init__(self, timeout=30):
        self.timeout = timeout

    async def run(self, argv):
        try:
            process = await asyncio.create_subprocess_exec(
                *argv,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as error:
            raise CommandFailure(f"could not start {argv[0]}") from error
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), timeout=self.timeout
            )
        except TimeoutError as error:
            process.kill()
            await process.communicate()
            raise AmbiguousDelivery(f"{argv[0]} outcome is uncertain after timeout") from error
        return CommandResult(
            process.returncode,
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
        )


class PaseoAdapter:
    def __init__(self, runner):
        self.runner = runner

    async def inspect_owner(self, agent_id):
        result = await self.runner.run(["paseo", "inspect", "--json", agent_id])
        if result.returncode != 0:
            raise CommandFailure("paseo inspect failed")
        try:
            payload = json.loads(result.stdout)
            return {
                "id": payload.get("ID", payload.get("id")),
                "serverId": payload.get(
                    "ServerID", payload.get("serverId", payload.get("server_id"))
                ),
                "archived": payload.get("Archived", payload.get("archived", False)),
                "status": payload.get("Status", payload.get("status")),
            }
        except (AttributeError, json.JSONDecodeError) as error:
            raise CommandFailure("paseo inspect returned invalid JSON") from error

    async def send_prompt(self, agent_id, prompt):
        descriptor, raw_path = tempfile.mkstemp(prefix="hermes-review-", suffix=".txt")
        prompt_path = Path(raw_path)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as prompt_file:
                prompt_file.write(prompt)
            prompt_path.chmod(0o600)
            result = await self.runner.run(
                [
                    "paseo",
                    "send",
                    agent_id,
                    "--prompt-file",
                    str(prompt_path),
                    "--no-wait",
                ]
            )
            if result.returncode != 0:
                raise CommandFailure("paseo send failed")
        finally:
            prompt_path.unlink(missing_ok=True)


class GithubAdapter:
    def __init__(self, runner):
        self.runner = runner

    async def read_pull_request(self, repository, pr_number):
        result = await self.runner.run(
            [
                "gh",
                "pr",
                "view",
                str(pr_number),
                "--repo",
                repository,
                "--json",
                "state,headRefOid,baseRefOid",
            ]
        )
        if result.returncode != 0:
            raise CommandFailure("gh pr view failed")
        try:
            payload = json.loads(result.stdout)
            return {
                "state": payload["state"],
                "head_sha": payload["headRefOid"],
                "base_sha": payload["baseRefOid"],
            }
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            raise CommandFailure("gh pr view returned invalid JSON") from error


class HermesAdapter:
    def __init__(self, runner):
        self.runner = runner

    async def send(self, target, body):
        descriptor, raw_path = tempfile.mkstemp(prefix="hermes-message-", suffix=".txt")
        message_path = Path(raw_path)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as message_file:
                message_file.write(body)
            message_path.chmod(0o600)
            result = await self.runner.run(
                [
                    "hermes",
                    "send",
                    "--to",
                    target,
                    "--file",
                    str(message_path),
                    "--json",
                ]
            )
            if result.returncode != 0:
                raise CommandFailure("hermes send failed")
            try:
                payload = json.loads(result.stdout)
                message_id = payload["message_id"]
            except (KeyError, TypeError, json.JSONDecodeError) as error:
                raise AmbiguousDelivery(
                    "hermes send succeeded without a confirmed message id"
                ) from error
            return str(message_id)
        finally:
            message_path.unlink(missing_ok=True)
