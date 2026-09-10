import argparse
import asyncio
import json
import sys
from pathlib import Path

from .adapters import AsyncCommandRunner, HermesAdapter
from .outbound import DecisionRequest, OutboundService
from .runtime import load_config, plugin_data_dir
from .storage import Storage


def build_parser():
    parser = argparse.ArgumentParser(prog="hermes-relay")
    commands = parser.add_subparsers(dest="command", required=True)

    open_parser = commands.add_parser("open", help="Open and send a review decision")
    open_parser.add_argument("--request-file", required=True)

    supersede = commands.add_parser("supersede", help="Supersede and resend a decision")
    supersede.add_argument("decision_id")
    supersede.add_argument("--request-file", required=True)

    answer = commands.add_parser("answer", help="Publish an owner answer")
    answer.add_argument("decision_id")
    answer.add_argument("--file", required=True)

    close = commands.add_parser("close", help="Close a transport decision")
    close.add_argument("decision_id")

    commands.add_parser("pending", help="Inspect unresolved transport state")

    retry = commands.add_parser("retry", help="Retry a definite failed send")
    retry.add_argument("attempt_id")
    return parser


def read_request(path):
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    return DecisionRequest(**payload)


async def dispatch(args, *, data_dir, sender, telegram_target, output):
    store = Storage(data_dir / "relay.sqlite3")
    try:
        if args.command == "pending":
            print(json.dumps(store.pending_snapshot(), indent=2, sort_keys=True), file=output)
            return 0
        if args.command == "close":
            decision = store.get_decision(args.decision_id)
            if decision is None or decision["status"] in {"closed", "superseded"}:
                raise ValueError("only an unresolved decision may be closed")
            store.set_decision_status(args.decision_id, "closed")
            print(json.dumps({"decision_id": args.decision_id, "status": "closed"}), file=output)
            return 0

        service = OutboundService(
            store=store,
            sender=sender,
            telegram_target=telegram_target,
        )
        if args.command == "open":
            result = await service.open(read_request(args.request_file))
        elif args.command == "supersede":
            result = await service.supersede(
                args.decision_id, read_request(args.request_file)
            )
        elif args.command == "answer":
            answer = Path(args.file).read_text(encoding="utf-8")
            result = await service.publish_answer(args.decision_id, answer)
        elif args.command == "retry":
            result = await service.retry_failed(args.attempt_id)
        else:
            raise ValueError(f"unsupported command: {args.command}")
        print(json.dumps(result, sort_keys=True), file=output)
        return 0
    finally:
        store.close()


def cli_main(
    argv=None,
    *,
    data_dir=None,
    sender=None,
    telegram_target=None,
    output=None,
):
    args = build_parser().parse_args(argv)
    data_dir = Path(data_dir) if data_dir is not None else plugin_data_dir()
    output = output or sys.stdout
    if args.command not in {"pending", "close"} and (
        sender is None or telegram_target is None
    ):
        config = load_config(data_dir)
        sender = sender or HermesAdapter(AsyncCommandRunner())
        telegram_target = telegram_target or f"telegram:{config.telegram_chat_id}"
    return asyncio.run(
        dispatch(
            args,
            data_dir=data_dir,
            sender=sender,
            telegram_target=telegram_target,
            output=output,
        )
    )
