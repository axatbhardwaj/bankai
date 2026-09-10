# Hermes review intermediary

Status: runtime source and tests moved to the public `paseo-hermes-relay` v0.1.0
repository at commit `1f2761cbc75ef24e8e2287f49ba56dd819923388`.

The user chose Telegram through the existing Hermes bot for PR decision alerts,
questions and replies. No Paseo links, new website, second Telegram poller or new
review orchestrator. The first deployment serves the existing VPS Paseo daemon.

## User flow

1. A persistent Paseo PR owner records a decision and sends a concise alert:
   repository/PR, proposed change, consequence, recommendation, question, revision.
2. The user replies to that alert. Hermes forwards the exact text to that owner.
3. The owner publishes its answer through the relay. Replying to the answer keeps
   the same decision association. Questions never authorize action.
4. Exact whole-message `approve`, `reject`, or `hold` are explicit decisions about
   this proposal only. No automatic merge or expansion of the original authority.
5. Material revision/proposal changes supersede the old alert. Closed, stale,
   missing-owner and archived-owner replies receive an explanation, not a guess.

## Implementation boundary

Use a user plugin at `~/.hermes/plugins/paseo-review-relay`. Its only inbound hook
is `pre_gateway_dispatch`; admit only Telegram DM events whose configured chat
and sender match and whose reply message ID exists in the plugin's own state.
Forwarded messages, edited messages, bot messages and non-text attachments cannot
grant authority. Unrelated messages continue through normal Hermes dispatch.
Mapped messages from unauthorized senders must never reach a Paseo agent.

The hook is inline: do no network/process work there. Persist the event once and
use `ctx.spawn_task` for asynchronous processing. Use fixed subprocess argument
arrays and UTF-8 prompt files. Never interpolate user text into shell commands.

Keep SQLite transport state under Hermes plugin-data: immutable decision identity,
owner agent, local server ID, repo/PR, head/base revision, proposal digest, status,
outbound message IDs and inbound message receipts. This is a delivery map, not a
replacement for Paseo review state. Duplicate inbound events forward at most once.
An ambiguous external send is recorded as uncertain; never automatically replay
it after a restart. Definite failures are visible and explicitly recoverable.

Before forwarding inspect the exact local Paseo owner and server identity. Reject
archived/missing owners. Before an approval, read live GitHub PR state/head/base
with fixed gh argv; any mismatch or read failure blocks it. Recheck the decision
record after asynchronous reads. The receiving driver must revalidate the receipt
and live revision before taking action, closing the remaining external-state race.

Provide a local CLI to open/supersede a decision, publish an answer, inspect pending
items and close a decision. Create the record before sending, attach the returned
message IDs only on confirmed delivery. A demo decision may test routing but must
never accept approval or identify a real PR. Owner configuration lives in a private
local config; repository files contain no personal IDs or secrets.

## Integration and rollout

Add a concise shared PR workflow reference for HUMAN_DECISION: changes beyond an
accepted spec involving trust/security, irreversible changes or material direction
must escalate even when agents agree. Finish technical review, hold APPROVE and
MERGE_READY, keep a persistent owner, check pending decisions on later runs.
Already authorized decisions remain decided. Keep routine review quiet.

Preserve existing VPS schedules, credentials and profile settings. Prepare exact
backups before deployment; install only this plugin, its configuration and narrow
policy pointers. Do not replace installed skill trees with older repository copies.
Only the Hermes gateway may need restarting to load the plugin; inspect active work
and avoid interruption. No Paseo restart, GitHub publication or merge is authorized.

## Acceptance

- Owner reply maps to the correct agent, preserves text and yields an in-chat ack.
- Questions preserve pending status; decisions do not bypass revision/owner checks.
- Wrong sender/chat/platform, unknown anchor, duplicate event, stale revision,
  closed decision and archived owner have meaningful tests.
- Send failure/restart cannot silently lose or double-forward an authorization.
- An answer can itself be replied to; delivery success is not called user receipt.
- Real Hermes plugin discovery/validation and synthetic real-hook tests pass on VPS.
- A clearly labeled demo alert reaches Telegram; a real user reply is the final
  end-to-end check. Do not fabricate a user event as proof of phone interaction.

## Decision evidence

Astra: AGREE. Fable: AGREE, source-verified handoff
`/tmp/hermes-telegram-review-relay-handoff.md`, agent
`0aa275ae-9acd-45b7-95a7-52e35b6a2f7f`. Category: inbound authority boundary.
The hook runs before core authorization, so explicit owner checks are mandatory.
Source runtime: Hermes 0.21.1 on VPS; Paseo 0.7.2. No nested review team.
