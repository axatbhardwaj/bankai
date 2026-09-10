from dataclasses import dataclass


DECISION_WORDS = {"approve", "reject", "hold"}
SKIP = {"action": "skip", "reason": "paseo-review-relay"}


@dataclass(frozen=True)
class RelayConfig:
    telegram_chat_id: str
    telegram_user_id: str
    server_id: str


class ReviewRelay:
    def __init__(self, *, store, config, paseo, github, telegram, spawn_task):
        self.store = store
        self.config = config
        self.paseo = paseo
        self.github = github
        self.telegram = telegram
        self.spawn_task = spawn_task

    def pre_gateway_dispatch(self, *, event, **_kwargs):
        platform = getattr(event.platform, "value", event.platform)
        source = event.source
        if (
            platform != "telegram"
            or source.chat_type != "dm"
            or str(source.chat_id) != self.config.telegram_chat_id
            or str(source.user_id) != self.config.telegram_user_id
            or not isinstance(event.text, str)
            or not event.reply_to_message_id
        ):
            return None

        kind = "decision" if event.text.casefold() in DECISION_WORDS else "question"
        decision, admitted = self.store.admit_receipt_for_anchor(
            platform="telegram",
            chat_id=source.chat_id,
            message_id=event.message_id,
            anchor_message_id=event.reply_to_message_id,
            sender_id=source.user_id,
            kind=kind,
            body=event.text,
        )
        if decision is None:
            return None
        if admitted:
            self.spawn_task(self._forward(event, decision, kind))
        return SKIP

    async def _forward(self, event, decision, kind):
        owner = await self.paseo.inspect_owner(decision["owner_agent_id"])
        if owner.get("archived") or owner.get("serverId") != decision["server_id"]:
            self.store.mark_receipt("telegram", event.source.chat_id, event.message_id, "refused")
            await self.telegram.send(
                event.source.chat_id,
                "This review owner is unavailable; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        prompt = (
            "[telegram-review-relay]\n"
            f"decision_id={decision['decision_id']}\n"
            f"kind={kind}\n"
            f"repository={decision['repository']}\n"
            f"pr={decision['pr_number']}\n"
            f"head={decision['head_sha']}\n"
            f"base={decision['base_sha']}\n"
            f"proposal_digest={decision['proposal_digest']}\n"
            f"text:\n{event.text}"
        )
        await self.paseo.send_prompt(decision["owner_agent_id"], prompt)
        self.store.mark_receipt("telegram", event.source.chat_id, event.message_id, "forwarded")
        await self.telegram.send(
            event.source.chat_id,
            "Forwarded to the persistent PR owner. This is delivery, not approval or action.",
            reply_to=event.message_id,
        )
