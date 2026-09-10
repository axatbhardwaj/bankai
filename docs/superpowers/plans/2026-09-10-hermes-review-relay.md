# Hermes Review Relay Implementation Plan

> For agentic workers: execute this single tightly coupled deliverable with the
> shared model-routing implementation and independent code-review roles.

**Goal:** Let the user communicate with the exact pending PR owner through Hermes.
**Architecture:** Native Hermes pre-dispatch hook, SQLite message map, fixed local
Paseo/GitHub CLI adapters and an outbound command. Keep review state in Paseo.
**Tech Stack:** Python 3.11 stdlib plus installed Hermes APIs; Bun repository checks.
**Spec:** `docs/superpowers/specs/2026-09-10-hermes-review-relay.md`

## Global constraints

VPS only. No second bot poller, public endpoint, arbitrary shell execution, secrets
in Git, remote deployment by workers, automatic merge, or overwritten skill trees.
Implementation may use read-only SSH to inspect the installed extension APIs.

## Task 1: Relay package, tests and workflow reference

Files: `configs/hermes-plugins/paseo-review-relay/` for manifest, hook, storage and
CLI; `tests/hermes_review_relay/` for stdlib unittest coverage; a concise usage and
install document beside the plugin; narrow references in the existing PR skills.

Interfaces: local CLI owns decision creation, answer publication, close and list;
Hermes `register(ctx)` owns hook registration; shared storage binds each Telegram
message to a fixed decision and revision. Runtime adapters are injectable so tests
exercise real state transitions without network side effects.

- [ ] Read the spec and Fable handoff; verify installed hook, plugin storage and
  context APIs before coding. Keep imported Hermes APIs at the plugin edge.
- [ ] Write tests first for valid owner question forwarding and rejection of a
  duplicate message ID. The test uses a temporary SQLite database, fake Paseo
  adapter and fake Telegram adapter; assert the mapped agent and exact prompt body.
- [ ] Run `python -m unittest discover -s tests/hermes_review_relay -v` and record
  the expected failing test before implementing the minimal passing path.
- [ ] Extend tests before adding wrong identity/chat/platform, unknown anchor,
  stale/closed decision, archived owner, live GitHub drift, approval vs question,
  command injection strings, answer anchoring and ambiguous delivery recovery.
- [ ] Implement the package with small modules and bounded external calls. Inspect
  real Hermes discovery using an isolated temporary HERMES_HOME on the VPS.
- [ ] Document exact CLI syntax, private config, install/rollback and workflow
  receipt verification. Integrate narrow HUMAN_DECISION policy references without
  changing model routing profiles, release state or unrelated workflows.
- [ ] Run the focused Python suite, appropriate Bun tests and lint/format checks.
  Return evidence and granular local semantic commits, ideally about 200 lines each.

## Task 2: Independent review and live rollout (driver-owned)

- [ ] Give review-code the immutable candidate, baseline
  `79e662d1261a93ab714228cbf576bdfbc4bd0643`, spec and a separate pinned checkout.
- [ ] Resolve blocking review findings through the implementer and re-review.
- [ ] Back up affected VPS files; verify current contents before narrow installation.
  Keep activation sequential and inspect the Hermes service before any restart.
- [ ] Verify plugin discovery, gateway health and synthetic hook behavior; preserve
  the existing bot's ordinary messages and all existing schedules.
- [ ] Send a clearly labeled demo and report actual delivery evidence. Ask the user
  to reply to it for the real phone-to-Paseo round trip; do not claim it beforehand.

## Execution record

- Existing isolated branch: `notify-user-on-high-stakes-pr-reviews`.
- Baseline: 1080 pass, 4 skip, 0 fail (Bun); log `/tmp/hermes-relay-baseline.log`.
- Driver is the only rollout owner. No product changes existed at task start.
