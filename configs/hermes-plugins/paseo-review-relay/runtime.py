import json
import os
from dataclasses import dataclass
from pathlib import Path

from .adapters import AsyncCommandRunner, GithubAdapter, PaseoAdapter
from .relay import RelayConfig, ReviewRelay
from .storage import Storage


PLUGIN_NAME = "paseo-review-relay"


class GatewayTelegram:
    def bind(self, gateway):
        return BoundGatewayTelegram(gateway)


class BoundGatewayTelegram:
    def __init__(self, gateway):
        self.gateway = gateway

    async def send(self, chat_id, text, reply_to=None):
        for platform, adapter in self.gateway.adapters.items():
            if getattr(platform, "value", platform) == "telegram":
                await adapter.send(str(chat_id), text, reply_to=reply_to)
                return
        raise RuntimeError("Telegram gateway adapter is unavailable")


class UnconfiguredRelay:
    @staticmethod
    def pre_gateway_dispatch(**kwargs):
        return None


@dataclass
class PluginRuntime:
    relay: ReviewRelay | UnconfiguredRelay
    store: Storage | None


def plugin_data_dir():
    default_home = Path.home() / ".hermes"
    hermes_home = Path(os.environ.get("HERMES_HOME", default_home)).expanduser()
    return hermes_home / "plugin-data" / PLUGIN_NAME


def load_config(data_dir):
    config_path = data_dir / "config.json"
    if config_path.stat().st_mode & 0o077:
        raise PermissionError(f"{config_path} must not be accessible by group or others")
    payload = json.loads(config_path.read_text(encoding="utf-8"))
    keys = ("telegramChatId", "telegramUserId", "serverId")
    if any(not isinstance(payload.get(key), str) or not payload[key] for key in keys):
        raise ValueError(f"{config_path} must contain non-empty {', '.join(keys)} strings")
    return RelayConfig(
        telegram_chat_id=payload["telegramChatId"],
        telegram_user_id=payload["telegramUserId"],
        server_id=payload["serverId"],
    )


def create_runtime(ctx):
    data_dir = plugin_data_dir()
    try:
        config = load_config(data_dir)
    except FileNotFoundError:
        return PluginRuntime(relay=UnconfiguredRelay(), store=None)
    store = Storage(data_dir / "relay.sqlite3")
    runner = AsyncCommandRunner()
    relay = ReviewRelay(
        store=store,
        config=config,
        paseo=PaseoAdapter(runner),
        github=GithubAdapter(runner),
        telegram=GatewayTelegram(),
        spawn_task=ctx.spawn_task,
    )
    return PluginRuntime(relay=relay, store=store)
