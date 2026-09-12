---
name: model-routing
description: Use for engineering work with decision uncertainty, nontrivial approach choices, conflicting evidence or repeated failed fixes; Matt Pocock planning and implementation skills; and specialist exploration, research, implementation, review, explanations, documentation or PR babysitting. Keep known mechanical work proportional.
---

# Model routing

Use `paseo` for agent, workspace, profile, and notification mechanics. Before the first launch, call `list_profiles`, read the selected profiles' notes, confirm provider availability with `list_providers`, and validate only their configured model, mode and effort with `list_models` and `inspect_provider`. Cache that discovery and verified workspace ownership for the task. Refresh it only when configuration, host, model or mode changes, after an ambiguous launch, or on a capability error. Store and display only the selected profile and capability fields, not full inventories. Cache unchanged skill references too.

Verify the required independent reviewer capability before costly implementation. Report missing capabilities and known quota outages early without substituting defaults. Reuse prior same-task failure evidence and do not repeat an identical quota probe; a blocked reviewer does not stop in-scope authoring unless the workflow makes review a prerequisite to implementation. Quota evidence never counts as approval or waives a required review or delivery gate. Put the selected profile's relevant notes into a compact, source-linked brief because `create_agent` does not inject them.

Before creating any workspace or agent, read and apply [references/workspace-placement.md](references/workspace-placement.md). This placement gate is independent of the optional task lifecycle below.

Before the first delegation for a future task, read `~/.config/haoshoku/paseo-tasks.json`. When it is valid and enabled, read [references/task-lifecycle.md](references/task-lifecycle.md) and apply that lifecycle to the task. A missing or invalid file fails closed: leave agent metadata and cleanup unchanged, then report that `haoshoku --paseo-tasks` must repair or create the configuration.

## Ownership

The main conversation is the driver, using its selected model and reasoning settings, and alone creates Paseo specialist agents. Prefer Astra at low reasoning when the main conversation can be selected; the actual selection remains the owner. It owns scope, acceptance, routing, execution, synthesis, decisions, recovery, and the final result. Keep the current runtime default and profile unchanged, and transfer ownership only through an explicit `paseo-handoff`. The driver creates only needed seats and validates returned evidence.

For an ordinary nontrivial change, select the ordinary implementation pair below. Direct work handles simple known edits. Add researchers only for distinct unresolved questions, run independent questions in parallel, and reuse a suitable worker before adding a seat. Selected workflows apply the same pair contract without creating a second orchestrator.

Workers perform bounded independent workflows and return evidence to the driver. A worker that sees this policy through global instructions does not launch another routing team. Native subagents required by an explicitly invoked skill remain allowed inside that worker's scope.

An explicitly invoked `implement-spec` is run by the driver, owns its graph, and selects routing profiles without a competing scheduler.

## Reasoning effort

The preferred Astra driver starts at low. Raise only the affected reasoning work when complexity, risk or conflicting evidence requires it; unrelated work returns to low. Sonnet xhigh is the explicit configured exception for `explore-codebase` and `explainer`; it is a fixed user preference, not a blanket escalation rule. Apart from these two configured roles, use xhigh only for an explicit exceptional request. Luna max remains the independent `explainer-review` route. There is no dedicated Astra advisor profile and no routine mandatory Astra advisor gate; the high-stakes Fable requirement below remains.

## Implementation pairs

Select one pair before implementation begins and record it in the task handoff. Profile IDs remain stable responsibility keys; apply provider, model, mode and effort overrides at launch instead of adding standing profiles.

The bundled `implement-code` and `review-code` profiles remain at medium for ordinary work. Override `thinkingOptionId` per launch, together with model-family fields, when the selected pair requires it.

- **Ordinary pair:** Sol medium author through `implement-code`, then an independent Opus medium reviewer through `review-code`.
- **High-stakes pair:** Opus high author through `implement-code`, then a fresh Sol high reviewer through `review-code`.

Choose the high-stakes pair for substantive authorization or trust-boundary changes; wallet, recovery or transaction correctness with significant loss exposure; irreversible data or infrastructure operations; or material architecture commitments. Difficulty without high stakes can raise the ordinary Sol author or Opus reviewer to high without inverting the pair. Mentioning security, touching many files, inspecting credentials, or reviewing a whole specification does not by itself select the high-stakes pair.

The selected author owns code, tests and later fixes. The reviewer must have authored none of the candidate, including uncommitted work. Apply the checkpoint, ownership-transfer and exact-revision rules in [references/briefings.md](references/briefings.md). The combined-branch final review for `implement-spec` uses a fresh opposite-family session at high.

Escalate only the affected phase to high when the same substantive defect survives two evidence-backed attempts, evidence rejects the current causal explanation, or a substantive review finding remains disputed after source and test verification. Inspecting credential configuration, mentioning security, reviewing a whole specification and routine read-only checks do not trigger high; unrelated tasks start at medium. Effort selection does not relax immutable-revision, independent-review, test, native metadata integrity, protected-config or publication-authority gates.

## Planning advice

Use `planning-advisor` at medium as the sole standing advisor only for an unresolved consequential decision that materially affects correctness, scope or risk after cheap factual checks. Consult when credible alternatives remain, evidence conflicts, an unexpected result defeats the current explanation, another speculative repair would follow rejected evidence, or the driver would dismiss a substantive review finding without resolution.

Resolve factual unknowns by reading or testing first. Settled and mechanical work continues without renewed consultation, including an already accepted same-task decision whose evidence has not materially changed. File count, worker launch, ordinary uncertainty language and nontrivial work alone do not trigger consultation.

The driver records its own assessment before reading the advisor output. Give the advisor a source-linked question and evidence, constraints, and acceptance criteria without a preferred answer. It returns AGREE, DISAGREE, or INSUFFICIENT EVIDENCE with evidence pointers, its strongest counterargument, and a targeted resolving check. Reuse the same-task advisor session and accepted evidence-bound decisions until a material change.

Ordinary disagreement calls for the targeted resolving check or new evidence. If only preference remains, choose the safe, reversible, in-scope convention. Correctness uncertainty requires an experiment, or the dependent human decision when no experiment is available. Consulting does not reopen existing authority or require repeated approval.

For decisions involving security or trust boundaries, irreversible data or infrastructure changes, significant financial or loss risk, or material architecture commitments, `planning-advisor` must return plain AGREE and the driver must record an accepted assessment before proceeding. Driver dissent starts a focused evidence round rather than an override. Run at most two focused evidence rounds, then send only the dependent decision to the human. An unavailable planning advisor pauses only the dependent high-stakes decision unless the user explicitly overrides this gate. Advisor agreement never grants missing external authority.

The advisor assesses decisions only: it keeps files unchanged, creates no children, and does not review candidates. Implementation and review use the selected pair. Follow the briefing and receipt contract in [references/briefings.md](references/briefings.md).

## Selected workflows

When the user invokes `grill-with-docs`, `to-spec`, `to-tickets`, `implement` or `implement-spec`, read [references/matt-workflows.md](references/matt-workflows.md) before dispatch or publication. The selected skill owns the method and human decisions; that reference assigns the work to models and defines the research and review gates. Its routes take precedence over the defaults below within the selected workflow, including small implementation fixes. A worker follows its bounded brief rather than becoming another workflow driver.

## Default routes

- Use `planning-advisor` for qualifying planning-advisor consultations. Explicit exceptional requests may select xhigh; it is not a default.
- For bounded codebase exploration, use `explore-codebase` to map modules, repository conventions and documented intent, or `explore-execution` to trace execution paths, callers, dependencies and relevant tests. Choose the seat matching the question; use both in parallel for distinct questions. Explorers return source locations, observations and uncertainties without product edits. Reuse existing research evidence or a suitable active researcher instead of duplicating the same scan.
- For substantial research with distinct unresolved questions, use `research-requirements` for requirements and `research-code` for code constraints; use only the needed seat when one question suffices. Apply the planning-advice triggers when reconciling conflicting findings. Use `research-web` only for targeted current external research.
- Give writable implementation, tests, and repairs to the selected `implement-code` author. Repository work uses one dedicated task worktree, repository policies, and the gh stack.
- Route recurring watchers and watchdogs through the independent `pr-monitor` and `pr-watchdog` Opus profiles. Their own sessions hold the timers and keep routine healthy ticks snapshot-only.
- For authored-PR babysitting to merge-ready, use [paseo-pr-babysit](../paseo-pr-babysit/SKILL.md): keep Opus monitors and watchdogs unchanged, and select the implementation pair per repair batch before the driver publishes.
- For ordinary peer PR review, use one Opus `review-code` seat. A peer reviewer authored none of the candidate; pair inversion applies to our implementation work, not automatically to someone else's PR. Use [paseo-pr-review](../paseo-pr-review/SKILL.md) only for an explicit six-angle request or substantial high-risk work with genuinely distinct coverage documented upfront.
- For implementation checkpoints and ordinary Git candidates, have `review-code` assess Standards, Spec and simplicity directly in one session at the selected effort. Invoke the upstream `code-review` two-axis subagent method only when the user explicitly invokes `code-review` or requests a full parallel review. Preserve the requirements of that explicit selection.
- For requested or materially useful visual artifacts, use the pinned upstream `visual-explainer` skill. Ordinary prose remains prose. Prefer `explainer` for rendering and use `explainer-review`, `explainer-content`, or `explainer-content-review` only when the artifact's fidelity, source risk, or repair needs justify them; there is no mandatory Markdown-to-HTML chain.
- Resolve the visual theme in the worker brief: an explicit request wins, otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Fixed `dark` or `light` requires full rendering and stays fixed across OS preferences, including when a request also says quick; explain that fallback. `system` may use upstream quick mode. Preserve source accuracy and the user's chosen format.
- Use `docs` for ordinary documentation from accepted evidence.
- Reuse `paseo-advisor` for a second opinion and `paseo-committee` for a hard unresolved disagreement.

Before dispatching review or documentation, read [references/briefings.md](references/briefings.md) once per unchanged task context and satisfy its briefing contract.

Use this workflow without Dvandva. Ordinary authorized work proceeds directly. Preserve Matt's human-only skill boundaries. When the user selected a workflow whose next step needs an explicit command they have not invoked, tell the driver or main conversation which command is needed. Implementation alone never creates an `/implement` gate.

## Evidence and recovery

Paseo owns agent and session state. Keep only a concise handoff artifact: objective, acceptance, source pointers, agent/workspace IDs and roles, current revision, verification, each decision and advisor status, evidence identity and resolving result, unresolved findings, owner, and next action. Notifications are wake-ups; inspect artifacts and run acceptance checks before declaring completion.

After interruption or an ambiguous launch, inspect recorded Paseo state and reuse the existing session when appropriate. Build no separate workflow state engine around this policy.

When a candidate changes, reuse the same reviewer to inspect the exact delta plus affected coverage. Run a full re-review only when scope, base or behavior changes substantively, or when an explicitly selected skill requires it. Never reuse approval without a refreshed SHA receipt. Existing test and check evidence may be reused only for an unchanged revision.

Profile IDs name responsibilities, not models or reasoning levels. Read each live profile to select its configured runtime; keep workflow references aligned with the role IDs.
