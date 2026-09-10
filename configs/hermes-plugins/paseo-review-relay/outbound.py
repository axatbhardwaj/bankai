import hashlib
import json
import uuid
from dataclasses import asdict, dataclass, replace

from .adapters import AmbiguousDelivery, CommandFailure


@dataclass(frozen=True)
class DecisionRequest:
    decision_id: str
    owner_agent_id: str
    server_id: str
    repository: str
    pr_number: int
    head_sha: str
    base_sha: str
    proposal: str
    consequence: str
    recommendation: str
    question: str
    demo: bool = False

    def proposal_digest(self):
        encoded = json.dumps(asdict(self), sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
        return hashlib.sha256(encoded).hexdigest()


class OutboundService:
    def __init__(self, *, store, sender, telegram_target):
        self.store = store
        self.sender = sender
        self.telegram_target = telegram_target

    async def open(self, request):
        request = self._sanitized_request(request)
        digest = request.proposal_digest()
        self.store.open_decision(
            decision_id=request.decision_id,
            owner_agent_id=request.owner_agent_id,
            server_id=request.server_id,
            repository=request.repository,
            pr_number=request.pr_number,
            head_sha=request.head_sha,
            base_sha=request.base_sha,
            proposal_digest=digest,
            demo=request.demo,
        )
        body = self._alert_body(request, digest)
        attempt_id = str(uuid.uuid4())
        self.store.create_outbound_attempt(
            attempt_id, request.decision_id, "alert", body
        )
        try:
            message_id = await self.sender.send(self.telegram_target, body)
        except AmbiguousDelivery:
            self.store.mark_outbound_state(attempt_id, "uncertain")
            self.store.set_decision_status(request.decision_id, "uncertain")
            raise
        except CommandFailure:
            self.store.mark_outbound_state(attempt_id, "failed")
            raise
        self.store.mark_outbound_sent(
            attempt_id,
            "telegram",
            self.telegram_target.removeprefix("telegram:"),
            message_id,
        )
        return {"attempt_id": attempt_id, "message_id": str(message_id)}

    async def retry_failed(self, failed_attempt_id):
        failed = self.store.get_outbound_attempt(failed_attempt_id)
        if failed is None or failed["state"] != "failed":
            raise ValueError("only a definite failed attempt may be retried")
        attempt_id = str(uuid.uuid4())
        self.store.create_outbound_attempt(
            attempt_id,
            failed["decision_id"],
            failed["kind"],
            failed["body"],
            retry_of=failed_attempt_id,
        )
        try:
            message_id = await self.sender.send(self.telegram_target, failed["body"])
        except AmbiguousDelivery:
            self.store.mark_outbound_state(attempt_id, "uncertain")
            self.store.set_decision_status(failed["decision_id"], "uncertain")
            raise
        except CommandFailure:
            self.store.mark_outbound_state(attempt_id, "failed")
            raise
        self.store.mark_outbound_sent(
            attempt_id,
            "telegram",
            self.telegram_target.removeprefix("telegram:"),
            message_id,
        )
        return {"attempt_id": attempt_id, "message_id": str(message_id)}

    async def publish_answer(self, decision_id, answer):
        decision = self.store.get_decision(decision_id)
        if decision is None or decision["status"] != "open":
            raise ValueError("answers require an open decision")
        body = (
            f"PR owner reply — {decision['repository']}#{decision['pr_number']}\n"
            f"Decision: {decision_id}\n"
            f"Revision: head {decision['head_sha']}; base {decision['base_sha']}\n\n"
            f"{answer}\n\n"
            "Reply to this message to keep the same owner and revision association."
        )
        attempt_id = str(uuid.uuid4())
        self.store.create_outbound_attempt(attempt_id, decision_id, "answer", body)
        try:
            message_id = await self.sender.send(self.telegram_target, body)
        except AmbiguousDelivery:
            self.store.mark_outbound_state(attempt_id, "uncertain")
            self.store.set_decision_status(decision_id, "uncertain")
            raise
        except CommandFailure:
            self.store.mark_outbound_state(attempt_id, "failed")
            raise
        self.store.mark_outbound_sent(
            attempt_id,
            "telegram",
            self.telegram_target.removeprefix("telegram:"),
            message_id,
        )
        return {"attempt_id": attempt_id, "message_id": str(message_id)}

    async def supersede(self, old_decision_id, request):
        request = self._sanitized_request(request)
        digest = request.proposal_digest()
        self.store.supersede_decision(
            old_decision_id,
            decision_id=request.decision_id,
            owner_agent_id=request.owner_agent_id,
            server_id=request.server_id,
            repository=request.repository,
            pr_number=request.pr_number,
            head_sha=request.head_sha,
            base_sha=request.base_sha,
            proposal_digest=digest,
            demo=request.demo,
        )
        body = self._alert_body(request, digest)
        attempt_id = str(uuid.uuid4())
        self.store.create_outbound_attempt(
            attempt_id, request.decision_id, "alert", body
        )
        try:
            message_id = await self.sender.send(self.telegram_target, body)
        except AmbiguousDelivery:
            self.store.mark_outbound_state(attempt_id, "uncertain")
            self.store.set_decision_status(request.decision_id, "uncertain")
            raise
        except CommandFailure:
            self.store.mark_outbound_state(attempt_id, "failed")
            raise
        self.store.mark_outbound_sent(
            attempt_id,
            "telegram",
            self.telegram_target.removeprefix("telegram:"),
            message_id,
        )
        return {"attempt_id": attempt_id, "message_id": str(message_id)}

    @staticmethod
    def _alert_body(request, digest):
        if request.demo:
            return (
                "DEMO REVIEW RELAY CHECK — no real pull request\n\n"
                f"Proposal: {request.proposal}\n"
                f"Consequence: {request.consequence}\n"
                f"Question: {request.question}\n\n"
                "This demo cannot accept approve, reject, or hold. Reply with a free-form question to test routing."
            )
        return (
            "HUMAN DECISION REQUIRED\n"
            f"{request.repository}#{request.pr_number}\n\n"
            f"Proposal: {request.proposal}\n"
            f"Consequence: {request.consequence}\n"
            f"Recommendation: {request.recommendation}\n"
            f"Question: {request.question}\n"
            f"Revision: head {request.head_sha}; base {request.base_sha}\n"
            f"Proposal digest: {digest}\n\n"
            "Reply with exactly one whole message: approve, reject, or hold.\n"
            "Anything else is forwarded as a question. Delivery never merges or approves automatically."
        )

    @staticmethod
    def _sanitized_request(request):
        if not request.demo:
            return request
        return replace(
            request,
            repository="__demo__",
            pr_number=0,
            head_sha="0" * 40,
            base_sha="0" * 40,
        )
