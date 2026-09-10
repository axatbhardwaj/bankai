from .adapters import (
    AmbiguousDelivery,
    AsyncCommandRunner,
    CommandFailure,
    CommandResult,
    GithubAdapter,
    HermesAdapter,
    PaseoAdapter,
)
from .cli import cli_main, doctor_snapshot
from .outbound import DecisionRequest, OutboundService
from .relay import RelayConfig, ReviewRelay
from .runtime import create_runtime
from .storage import Storage


__all__ = [
    "AmbiguousDelivery",
    "AsyncCommandRunner",
    "CommandFailure",
    "CommandResult",
    "DecisionRequest",
    "GithubAdapter",
    "HermesAdapter",
    "OutboundService",
    "PaseoAdapter",
    "RelayConfig",
    "ReviewRelay",
    "Storage",
    "cli_main",
    "doctor_snapshot",
]


def register(ctx):
    runtime = create_runtime(ctx)
    ctx.register_hook("pre_gateway_dispatch", runtime.relay.pre_gateway_dispatch)
    return runtime
