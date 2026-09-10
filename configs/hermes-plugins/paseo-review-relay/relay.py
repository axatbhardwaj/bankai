from dataclasses import dataclass

from .adapters import AmbiguousDelivery, CommandFailure, ServerIdentityMismatch


DECISION_WORDS = {"approve", "reject", "hold"}
SKIP = {"action": "skip", "reason": "paseo-review-relay"}
ATTACHMENT_FIELDS = (
    "animation",
    "audio",
    "contact",
    "document",
    "location",
    "photo",
    "sticker",
    "video",
    "video_note",
    "voice",
)


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

    def pre_gateway_dispatch(self, *, event, **kwargs):
        source = event.source
        source_platform = getattr(source, "platform", None)
        platform = getattr(source_platform, "value", source_platform)
        if (
            platform != "telegram"
            or source.chat_type != "dm"
            or str(source.chat_id) != self.config.telegram_chat_id
            or str(source.user_id) != self.config.telegram_user_id
            or not isinstance(event.text, str)
            or not event.reply_to_message_id
            or self._is_unsafe_telegram_message(event.raw_message)
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
            telegram = self.telegram
            if hasattr(telegram, "bind"):
                telegram = telegram.bind(kwargs.get("gateway"))
            self.spawn_task(self._forward(event, decision, kind, telegram))
        return SKIP

    @staticmethod
    def _is_unsafe_telegram_message(message):
        if message is None:
            return True
        author = getattr(message, "from_user", None)
        return bool(
            getattr(message, "forward_origin", None)
            or getattr(message, "forward_date", None)
            or getattr(message, "edit_date", None)
            or getattr(author, "is_bot", False)
            or any(getattr(message, field, None) for field in ATTACHMENT_FIELDS)
        )

    async def _forward(self, event, decision, kind, telegram):
        if decision["status"] != "open":
            self.store.mark_receipt("telegram", event.source.chat_id, event.message_id, "refused")
            await telegram.send(
                event.source.chat_id,
                "This review request has expired; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        if decision["server_id"] != self.config.server_id:
            self.store.set_decision_status(decision["decision_id"], "blocked")
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "refused"
            )
            await telegram.send(
                event.source.chat_id,
                "This review request belongs to a different Paseo server; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        if decision["demo"] and kind == "decision":
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "refused"
            )
            await telegram.send(
                event.source.chat_id,
                "This is a demo relay and cannot accept decisions. Send a free-form question to test routing.",
                reply_to=event.message_id,
            )
            return
        try:
            owner = await self.paseo.inspect_owner(decision["owner_agent_id"])
        except (CommandFailure, AmbiguousDelivery):
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "failed"
            )
            await telegram.send(
                event.source.chat_id,
                "Could not inspect the persistent PR owner; your reply was not routed. Reply again later to retry.",
                reply_to=event.message_id,
            )
            return
        if (
            not owner
            or owner.get("id") != decision["owner_agent_id"]
            or owner.get("archived")
            or owner.get("serverId") != decision["server_id"]
        ):
            self.store.set_decision_status(decision["decision_id"], "blocked")
            self.store.mark_receipt("telegram", event.source.chat_id, event.message_id, "refused")
            await telegram.send(
                event.source.chat_id,
                "This review owner is unavailable; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        if kind == "decision":
            try:
                live = await self.github.read_pull_request(
                    decision["repository"], decision["pr_number"]
                )
            except Exception:
                self.store.mark_receipt(
                    "telegram", event.source.chat_id, event.message_id, "failed"
                )
                await telegram.send(
                    event.source.chat_id,
                    "Could not validate the live PR revision; no decision was routed. Reply again later to retry.",
                    reply_to=event.message_id,
                )
                return
            if (
                live.get("state") != "OPEN"
                or live.get("head_sha") != decision["head_sha"]
                or live.get("base_sha") != decision["base_sha"]
            ):
                self.store.set_decision_status(decision["decision_id"], "blocked")
                self.store.mark_receipt(
                    "telegram", event.source.chat_id, event.message_id, "refused"
                )
                await telegram.send(
                    event.source.chat_id,
                    "The live PR revision no longer matches this review request; no decision was routed.",
                    reply_to=event.message_id,
                )
                return
        current = self.store.get_decision(decision["decision_id"])
        if current is None or current["status"] != "open":
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "refused"
            )
            await telegram.send(
                event.source.chat_id,
                "This review request expired during validation; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        revalidation = "driver_must_revalidate=true\n" if kind == "decision" else ""
        prompt = (
            "[telegram-review-relay]\n"
            f"decision_id={decision['decision_id']}\n"
            f"kind={kind}\n"
            f"repository={decision['repository']}\n"
            f"pr={decision['pr_number']}\n"
            f"head={decision['head_sha']}\n"
            f"base={decision['base_sha']}\n"
            f"proposal_digest={decision['proposal_digest']}\n"
            f"{revalidation}"
            f"text:\n{event.text}"
        )
        try:
            await self.paseo.send_prompt(
                decision["owner_agent_id"], prompt, decision["server_id"]
            )
        except ServerIdentityMismatch:
            self.store.set_decision_status(decision["decision_id"], "blocked")
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "refused"
            )
            await telegram.send(
                event.source.chat_id,
                "The local Paseo server identity changed; your reply was not routed.",
                reply_to=event.message_id,
            )
            return
        except AmbiguousDelivery:
            self.store.set_decision_status(decision["decision_id"], "uncertain")
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "uncertain"
            )
            await telegram.send(
                event.source.chat_id,
                "Forwarding outcome is uncertain and will not be replayed automatically. Treat it as not received until inspected.",
                reply_to=event.message_id,
            )
            return
        except CommandFailure:
            self.store.mark_receipt(
                "telegram", event.source.chat_id, event.message_id, "failed"
            )
            await telegram.send(
                event.source.chat_id,
                "Forwarding failed; the owner did not receive this relay attempt. Reply again to retry.",
                reply_to=event.message_id,
            )
            return
        self.store.mark_receipt("telegram", event.source.chat_id, event.message_id, "forwarded")
        await telegram.send(
            event.source.chat_id,
            "Forwarded to the persistent PR owner. This is delivery, not approval or action.",
            reply_to=event.message_id,
        )
