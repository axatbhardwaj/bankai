---
name: model-routing
description: Use for engineering planning with ambiguous requirements, design tradeoffs, conflicting findings or repeated failed fixes; Matt Pocock planning and implementation skills; and specialist exploration, research, implementation, review, explanations, documentation or PR babysitting. Keep ordinary low-impact work proportional.
---

# Model routing

Use `paseo` for agent, workspace, profile, and notification mechanics. Before each launch, call `list_profiles`, read the selected profile's notes, confirm provider availability with `list_providers`, and validate its configured model and effort with `list_models` and `inspect_provider`. Profile IDs are durable policy keys; names are display labels, and exact runtime settings live in profiles. Report a missing or unavailable capability in the main conversation without substituting defaults. Put the selected profile's relevant notes into the worker brief because `create_agent` does not inject them.

Before creating any workspace or agent, read and apply [references/workspace-placement.md](references/workspace-placement.md). This placement gate is independent of the optional task lifecycle below.

Before the first delegation for a future task, read `~/.config/haoshoku/paseo-tasks.json`. When it is valid and enabled, read [references/task-lifecycle.md](references/task-lifecycle.md) and apply that lifecycle to the task. A missing or invalid file fails closed: leave agent metadata and cleanup unchanged, then report that `haoshoku --paseo-tasks` must repair or create the configuration.

## Ownership

The main conversation's selected model is the driver and alone creates Paseo specialist agents. The driver owns scope, acceptance, routing, execution, synthesis, decisions, recovery, and the final result. Use its selected model and reasoning settings; do not create a saved driver profile or switch the default model. The driver creates only needed seats and validates returned evidence.

Prefer subagent-driven work for nontrivial tasks: the driver delegates bounded exploration, research, implementation and review to appropriate Paseo profiles, then synthesizes their evidence. Run independent subtasks in parallel; keep dependent work sequential and reuse a suitable existing worker before adding a seat. Simple lookups and low-impact one-step tasks can stay direct unless a selected workflow explicitly assigns them to a worker. This preference applies within named workflows without changing their role assignments or creating a second orchestrator.

Workers perform bounded independent workflows and return evidence to the driver. A worker that sees this policy through global instructions does not launch another routing team. Native subagents required by an explicitly invoked skill remain allowed inside that worker's scope.

An explicit `paseo-handoff` may transfer driver ownership. An explicitly invoked `implement-spec` is run by the driver, owns its graph, and selects routing profiles without a competing scheduler.

## Planning with Fable

Before substantial planning, use Fable through `fable-planner`. Planning is substantial when the task requires a written plan or acceptance decisions beyond a mechanical change, or has ambiguous requirements, multiple credible approaches, boundary or public-behavior changes, conflicting evidence, or repeated failures. Delegate while the approach is still open so Fable can shape the plan. A superficial checklist does not make routine known work substantial. Routine known work stays direct unless a selected workflow assigns it to a worker.

Give Fable the objective, constraints and available evidence, and ownership of a bounded planning output: recommended approach, alternatives and tradeoffs, assumptions and evidence gaps, acceptance criteria, and implementation steps or the next diagnostic experiment. Fable inspects relevant sources and returns the proposal; the driver assesses it and owns the final decision. Continue independent evidence gathering while Fable works.

Reuse the same Fable session when new evidence materially changes the plan. Simple lookups, mechanical edits and routine execution of an accepted plan stay direct unless the selected workflow assigns a worker. Ordinary planning advice does not require formal consensus; apply the gate below only to high-stakes decisions. Fable keeps product files unchanged, implementation stays with its assigned seat, and Opus retains independent candidate review.

If required Fable planning is unavailable, stop only the dependent planning decision and report the gap; do not silently settle the plan or substitute another profile.

## Technical advice with Astra

Before consequential technical design, use Astra through `technical-advisor`. This checkpoint applies to module boundaries, data or API contracts, failure or concurrency handling, and security-relevant configuration. Brief a scoped question with evidence pointers; require a recommendation, risks, alternatives, and acceptance checks. The driver owns the decision: ordinary technical advice is not a veto, candidate review, or implementation.

An Astra driver may record its own Astra assessment without a redundant child. An explicit independent Astra seat from the user or selected workflow still requires `technical-advisor`. If required Astra advice is unavailable, stop only the dependent technical decision and report the gap; do not substitute another profile.

Reuse the same-task Fable or Astra advisor when evidence or the plan materially changes, and after recurring failure. Do not invoke both advisors automatically; each checkpoint fires only for its own trigger. Keep briefs concise and point to evidence instead of copying it.

## High-stakes decision consensus

Use actual Astra and Fable assessments when evaluating a plausible new decision about security or trust boundaries (for example, changing which model receives `bypassPermissions`), irreversible data or infrastructure changes (a migration without a restore path), significant financial or loss risk (overwriting secrets or custom profiles), or material architecture commitments (adding a second orchestrator or changing review gates). Obtain Astra's position first through `technical-advisor`, unless an Astra driver records its own position and no independent seat is required; then have `fable-planner` assess the same evidence or revision. The driver records why the proposal is consensus-class. If Fable flags one and the driver rejects that classification, record the rejected classification and reason. Ordinary low-impact work, routine fix/review iterations, ticket-level choices inside an accepted spec, and reversible configuration changes with a backup stay proportional and do not use this gate.

Proceed only when Astra and Fable both record plain AGREE against the same evidence or revision. A conditional answer, silence, or absence of objection is not agreement. A material disagreement gets at most two focused evidence rounds after the initial assessments, then goes to the human with no silent override. An action the user already explicitly authorized is decided; do not reopen an accepted decision without a material deviation. The gate applies only to a new high-stakes proposal or material deviation, and never grants missing external authority. If either required advisor is unavailable, stop only the dependent decision; `paseo-advisor` and `paseo-committee` are not substitutes. Follow the assessment and escalation receipt in [references/briefings.md](references/briefings.md).

Fable may inspect relevant sources and diffs for the decision, but does not review the whole candidate or issue its verdict. Opus approval is not consensus on a decision, and consensus on a decision is not approval of a candidate. Give an agreed decision to `review-opus` as a specification pointer while preserving its independent review.

## Selected workflows

When the user invokes `grill-with-docs`, `to-spec`, `to-tickets`, `implement` or `implement-spec`, read [references/matt-workflows.md](references/matt-workflows.md) before dispatch or publication. The selected skill owns the method and human decisions; that reference assigns the work to models and defines the research and review gates. Its routes take precedence over the defaults below within the selected workflow, including small implementation fixes. A worker follows its bounded brief rather than becoming another workflow driver.

## Default routes

- Use `fable-planner` for substantial planning and the Fable side of high-stakes decisions.
- Use `technical-advisor` for consequential technical design and the Astra side of high-stakes decisions, subject to the Astra-driver exception above.
- For bounded codebase exploration, use `explore-sonnet` to map modules, repository conventions and documented intent, or `explore-terra` to trace execution paths, callers, dependencies and relevant tests. Choose the seat matching the question; use both in parallel for distinct questions. Explorers return source locations, observations and uncertainties without product edits. Reuse existing research evidence or a suitable active researcher instead of duplicating the same scan.
- For substantial research, have `research-opus` independently investigate requirements, documents, prior decisions, and alternatives while `research-sol-medium` traces code, dependencies, tests, and implementation constraints. Apply the planning and technical-design triggers above when reconciling their findings; the driver owns the final synthesis. Use `research-grok` only for targeted current external research.
- Give writable implementation, tests, and repairs to `implement-sol-high`. Repository work uses one dedicated task worktree, repository policies, and the gh stack.
- Route recurring watchers and watchdogs through standalone Grok profiles. Their own sessions hold the timers and keep routine healthy ticks snapshot-only.
- For authored-PR babysitting to merge-ready, use [paseo-pr-babysit](../paseo-pr-babysit/SKILL.md): Grok monitors and watchdogs, Sol repairs, and Opus reviews before the driver publishes.
- For peer PR reviews or an explicitly requested five-angle review, use [paseo-pr-review](../paseo-pr-review/SKILL.md). Its five seats replace the single-review route. An explicit `code-review` request retains that skill's two-axis workflow.
- For implementation checkpoints and other applicable Git candidates, have `review-opus` run `code-review` once. The driver and implementer do not duplicate its review.
- For requested or materially useful visual artifacts, use the pinned upstream `visual-explainer` skill. Ordinary prose remains prose. Prefer `explainer-opus` for rendering and use `explainer-review-terra`, `explainer-content-sol`, or `explainer-content-opus` only when the artifact's fidelity, source risk, or repair needs justify them; there is no mandatory Markdown-to-HTML chain.
- Resolve the visual theme in the worker brief: an explicit request wins, otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Fixed `dark` or `light` requires full rendering and stays fixed across OS preferences, including when a request also says quick; explain that fallback. `system` may use upstream quick mode. Preserve source accuracy and the user's chosen format.
- Use `docs-glm` for ordinary documentation from accepted evidence.
- Reuse `paseo-advisor` for a second opinion and `paseo-committee` for a hard unresolved disagreement.

Before dispatching review or documentation, read [references/briefings.md](references/briefings.md) and satisfy its briefing contract.

Use this workflow without Dvandva. Ordinary authorized work proceeds directly. Preserve Matt's human-only skill boundaries. When the user selected a workflow whose next step needs an explicit command they have not invoked, tell the driver or main conversation which command is needed. Implementation alone never creates an `/implement` gate.

## Evidence and recovery

Paseo owns agent and session state. Keep only a concise handoff artifact: objective, acceptance, source pointers, agent/workspace IDs and roles, current revision, verification, consensus decisions with category, both verdicts, evidence pointers, and revision or evidence-set identity, unresolved findings, owner, and next action. Notifications are wake-ups; inspect artifacts and run acceptance checks before declaring completion.

After interruption or an ambiguous launch, inspect recorded Paseo state and reuse the existing session when appropriate. Build no separate workflow state engine around this policy.

The legacy profile IDs `docs-glm`, `pr-correctness-grok`, `pr-requirements-glm`, and `pr-monitor-glm` remain stable workflow keys. Documentation, correctness, and requirements use Claude Opus 5 at medium effort. The recurring `pr-monitor-glm` and `watchdog-grok` profiles use standalone Grok 4.6 without mode or thinking-option fields.
