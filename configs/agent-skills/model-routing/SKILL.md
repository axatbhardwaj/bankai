---
name: model-routing
description: Use for engineering work with decision uncertainty, nontrivial approach choices, conflicting evidence or repeated failed fixes; Matt Pocock planning and implementation skills; and specialist exploration, research, implementation, review, explanations, documentation or PR babysitting. Keep known mechanical work proportional.
---

# Model routing

Use `paseo` for agent, workspace, profile, and notification mechanics. Before each launch, call `list_profiles`, read the selected profile's notes, confirm provider availability with `list_providers`, and validate its configured model and effort with `list_models` and `inspect_provider`. Profile IDs are durable policy keys; names are display labels, and exact runtime settings live in profiles. Report a missing or unavailable capability in the main conversation without substituting defaults. Put the selected profile's relevant notes into the worker brief because `create_agent` does not inject them.

Before creating any workspace or agent, read and apply [references/workspace-placement.md](references/workspace-placement.md). This placement gate is independent of the optional task lifecycle below.

Before the first delegation for a future task, read `~/.config/haoshoku/paseo-tasks.json`. When it is valid and enabled, read [references/task-lifecycle.md](references/task-lifecycle.md) and apply that lifecycle to the task. A missing or invalid file fails closed: leave agent metadata and cleanup unchanged, then report that `haoshoku --paseo-tasks` must repair or create the configuration.

## Ownership

The main conversation is the driver, using its selected model and reasoning settings, and alone creates Paseo specialist agents. Prefer Astra at low reasoning when the main conversation can be selected; the actual selection remains the owner. It owns scope, acceptance, routing, execution, synthesis, decisions, recovery, and the final result. Keep the current runtime default and profile unchanged, and transfer ownership only through an explicit `paseo-handoff`. The driver creates only needed seats and validates returned evidence.

Prefer subagent-driven work for nontrivial tasks: the driver delegates bounded exploration, research, implementation and review to appropriate Paseo profiles, then synthesizes their evidence. Run independent subtasks in parallel; keep dependent work sequential and reuse a suitable existing worker before adding a seat. Simple lookups and low-impact one-step tasks can stay direct unless a selected workflow explicitly assigns them to a worker. This preference applies within named workflows without changing their role assignments or creating a second orchestrator.

Workers perform bounded independent workflows and return evidence to the driver. A worker that sees this policy through global instructions does not launch another routing team. Native subagents required by an explicitly invoked skill remain allowed inside that worker's scope.

An explicitly invoked `implement-spec` is run by the driver, owns its graph, and selects routing profiles without a competing scheduler.

## Reasoning effort

The preferred Astra driver starts at low. Raise only the affected reasoning work when task complexity, risk, or conflicting evidence requires it; unrelated work returns to low. Astra xhigh remains available on demand in the main conversation without a dedicated advisor profile or mandatory advisor gate.

`implement-code` and `review-code` remain at medium by default. Override `thinkingOptionId` per launch instead of creating duplicate high profiles. Start the affected phase at high for security or trust boundaries, irreversible data or infrastructure changes, significant financial or loss risk, and material architecture commitments. The combined-branch final review for `implement-spec` also starts at high.

Escalate only the affected phase to high when the same substantive defect survives two evidence-backed attempts, evidence rejects the current causal explanation, or a substantive review finding remains disputed after source and test verification. File count, ordinary unfamiliarity, one failing test, and routine review corrections do not trigger high; unrelated tasks start at medium. Effort selection does not relax immutable-revision, independent-review, test, or authority gates.

## Planning advice

Use `planning-advisor` at xhigh as the sole standing advisor. Consult it before committing to an initial nontrivial approach that interprets requirements, chooses among alternatives, introduces new behavior, interfaces, or boundaries, sets a failure strategy, or has uncertain acceptance.

Any sliver of decision doubt triggers planning advice, including doubt about whether advice is warranted. Consult when a worker flags a decision, evidence conflicts, an unexpected result undermines the current explanation, a repair hypothesis is rejected before another speculative fix, the driver would dismiss a substantive review finding, or the material plan changes.

Resolve a factual unknown by directly reading or testing when that can settle it; send remaining decision uncertainty to the planning advisor. Routine mechanical work with a known approach stays direct without an advisor pass for each edit. File count, worker launch, or hedge words alone do not trigger consultation.

The driver records its own assessment before reading the advisor output. Give the advisor a source-linked question and evidence, constraints, and acceptance criteria without a preferred answer. It returns AGREE, DISAGREE, or INSUFFICIENT EVIDENCE with evidence pointers, its strongest counterargument, and a targeted resolving check. Reuse the same-task advisor session and accepted evidence-bound decisions until a material change.

Ordinary disagreement calls for the targeted resolving check or new evidence. If only preference remains, choose the safe, reversible, in-scope convention. Correctness uncertainty requires an experiment, or the dependent human decision when no experiment is available. Consulting does not reopen existing authority or require repeated approval.

For decisions involving security or trust boundaries, irreversible data or infrastructure changes, significant financial or loss risk, or material architecture commitments, `planning-advisor` must return plain AGREE and the driver must record an accepted assessment before proceeding. Driver dissent starts a focused evidence round rather than an override. Run at most two focused evidence rounds, then send only the dependent decision to the human. An unavailable planning advisor pauses only the dependent high-stakes decision unless the user explicitly overrides this gate. Advisor agreement never grants missing external authority.

The advisor assesses decisions only: it keeps files unchanged, creates no children, and does not review candidates. Implementation stays with `implement-code`; Opus remains the independent candidate reviewer. Follow the briefing and receipt contract in [references/briefings.md](references/briefings.md).

## Selected workflows

When the user invokes `grill-with-docs`, `to-spec`, `to-tickets`, `implement` or `implement-spec`, read [references/matt-workflows.md](references/matt-workflows.md) before dispatch or publication. The selected skill owns the method and human decisions; that reference assigns the work to models and defines the research and review gates. Its routes take precedence over the defaults below within the selected workflow, including small implementation fixes. A worker follows its bounded brief rather than becoming another workflow driver.

## Default routes

- Use `planning-advisor` for standing planning-advisor consultations. Astra xhigh is an on-demand driver setting, not a mandatory advisor seat.
- For bounded codebase exploration, use `explore-codebase` to map modules, repository conventions and documented intent, or `explore-execution` to trace execution paths, callers, dependencies and relevant tests. Choose the seat matching the question; use both in parallel for distinct questions. Explorers return source locations, observations and uncertainties without product edits. Reuse existing research evidence or a suitable active researcher instead of duplicating the same scan.
- For substantial research, have `research-requirements` independently investigate requirements, documents, prior decisions, and alternatives while `research-code` traces code, dependencies, tests, and implementation constraints. Apply the planning-advice triggers when reconciling their findings; the driver owns the final synthesis. Use `research-web` only for targeted current external research.
- Give writable implementation, tests, and repairs to `implement-code` at the effort selected by the reasoning policy above. Repository work uses one dedicated task worktree, repository policies, and the gh stack.
- Route recurring watchers and watchdogs through the independent `pr-monitor` and `pr-watchdog` Opus profiles. Their own sessions hold the timers and keep routine healthy ticks snapshot-only.
- For authored-PR babysitting to merge-ready, use [paseo-pr-babysit](../paseo-pr-babysit/SKILL.md): Opus monitors and watchdogs, Sol repairs, and Opus reviews before the driver publishes.
- For peer PR reviews or an explicitly requested six-angle review, use [paseo-pr-review](../paseo-pr-review/SKILL.md). Its six seats replace the single-review route. An explicit `code-review` request retains that skill's two-axis workflow.
- For implementation checkpoints and other applicable Git candidates, have `review-code` run `code-review` once at the effort selected by the reasoning policy above and apply [references/simplicity-review.md](references/simplicity-review.md) inside that seat. The driver and implementer do not duplicate its review or add another checkpoint agent.
- For requested or materially useful visual artifacts, use the pinned upstream `visual-explainer` skill. Ordinary prose remains prose. Prefer `explainer` for rendering and use `explainer-review`, `explainer-content`, or `explainer-content-review` only when the artifact's fidelity, source risk, or repair needs justify them; there is no mandatory Markdown-to-HTML chain.
- Resolve the visual theme in the worker brief: an explicit request wins, otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Fixed `dark` or `light` requires full rendering and stays fixed across OS preferences, including when a request also says quick; explain that fallback. `system` may use upstream quick mode. Preserve source accuracy and the user's chosen format.
- Use `docs` for ordinary documentation from accepted evidence.
- Reuse `paseo-advisor` for a second opinion and `paseo-committee` for a hard unresolved disagreement.

Before dispatching review or documentation, read [references/briefings.md](references/briefings.md) and satisfy its briefing contract.

Use this workflow without Dvandva. Ordinary authorized work proceeds directly. Preserve Matt's human-only skill boundaries. When the user selected a workflow whose next step needs an explicit command they have not invoked, tell the driver or main conversation which command is needed. Implementation alone never creates an `/implement` gate.

## Evidence and recovery

Paseo owns agent and session state. Keep only a concise handoff artifact: objective, acceptance, source pointers, agent/workspace IDs and roles, current revision, verification, each decision and advisor status, evidence identity and resolving result, unresolved findings, owner, and next action. Notifications are wake-ups; inspect artifacts and run acceptance checks before declaring completion.

After interruption or an ambiguous launch, inspect recorded Paseo state and reuse the existing session when appropriate. Build no separate workflow state engine around this policy.

Profile IDs name responsibilities, not models or reasoning levels. Read each live profile to select its configured runtime; keep workflow references aligned with the role IDs.
