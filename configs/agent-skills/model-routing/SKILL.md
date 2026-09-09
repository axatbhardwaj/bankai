---
name: model-routing
description: Route work through Astra-led Paseo profiles. Use for Matt Pocock planning and implementation skills, or when specialists improve exploration, research, implementation, review, explanations, documentation or PR babysitting. Keep ordinary low-impact work proportional.
---

# Model routing

Use `paseo` for agent, workspace, profile, and notification mechanics. Before each launch, call `list_profiles`, read the selected profile's notes, confirm provider availability with `list_providers`, and validate its configured model and effort with `list_models` and `inspect_provider`. Profile names are durable policy keys; exact runtime settings live in profiles. Report a missing or unavailable capability in the main conversation without substituting defaults. Put the selected profile's relevant notes into the worker brief because `create_agent` does not inject them.

## Ownership

The main conversation is the task driver and alone creates Paseo specialist agents. It owns scope, acceptance, routing, synthesis, decisions, recovery, and the final result. Use the main conversation's selected model and reasoning settings. It creates only needed seats and validates returned evidence.

Prefer subagent-driven work for nontrivial tasks: the driver delegates bounded exploration, research, implementation and review to appropriate Paseo profiles, then synthesizes their evidence. Run independent subtasks in parallel; keep dependent work sequential and reuse a suitable existing worker before adding a seat. Simple lookups and low-impact one-step tasks can stay direct unless a selected workflow explicitly assigns them to a worker. This preference applies within named workflows without changing their role assignments or creating a second orchestrator.

Workers perform bounded independent workflows and return evidence to the driver. A worker that sees this policy through global instructions does not launch another routing team. Native subagents required by an explicitly invoked skill remain allowed inside that worker's scope.

An explicit `paseo-handoff` may transfer driver ownership. An explicitly invoked `implement-spec` is run by the driver, owns its graph, and selects routing profiles without a competing scheduler.

## High-stakes decision consensus

Use `fable-planner` with Astra when evaluating a plausible new decision about security or trust boundaries (for example, changing which model receives `bypassPermissions`), irreversible data or infrastructure changes (a migration without a restore path), significant financial or loss risk (overwriting secrets or custom profiles), or material architecture commitments (adding a second orchestrator or changing review gates). The driver records why the proposal is consensus-class; if Fable flags one and the driver rejects that classification, record the rejected classification and reason. Ordinary low-impact work, routine fix/review iterations, ticket-level choices inside an accepted spec, and reversible configuration changes with a backup stay proportional and do not use this gate.

Proceed only when Astra and Fable both record plain AGREE against the same evidence or revision. A conditional answer, silence, or absence of objection is not agreement. A material disagreement gets at most two focused evidence rounds after the initial assessments, then goes to the human with no silent override. An action the user already explicitly authorized is decided; the gate applies only to a new high-stakes proposal or material deviation, and never grants missing external authority. If Fable is unavailable, dependent decisions stay blocked; `paseo-advisor` and `paseo-committee` are not substitutes. Follow the assessment and escalation receipt in [references/briefings.md](references/briefings.md).

Fable may inspect relevant sources and diffs for the decision, but does not review the whole candidate or issue its verdict. Opus approval is not consensus on a decision, and consensus on a decision is not approval of a candidate. Give an agreed decision to `review-opus` as a specification pointer while preserving its independent review.

## Selected workflows

When the user invokes `grill-with-docs`, `to-spec`, `to-tickets`, `implement` or `implement-spec`, read [references/matt-workflows.md](references/matt-workflows.md) before dispatch or publication. The selected skill owns the method and human decisions; that reference assigns the work to models and defines the research and review gates. Its routes take precedence over the defaults below within the selected workflow, including small implementation fixes. A worker follows its bounded brief rather than becoming another workflow driver.

## Default routes

- Use `fable-planner` as the persistent planning and high-stakes decision partner.
- For bounded codebase exploration, use `explore-sonnet` to map modules, repository conventions and documented intent, or `explore-terra` to trace execution paths, callers, dependencies and relevant tests. Choose the seat matching the question; use both in parallel for distinct questions. Explorers return source locations, observations and uncertainties without product edits. Reuse existing research evidence or a suitable active researcher instead of duplicating the same scan.
- For substantial research, have `research-opus` independently investigate requirements, documents, prior decisions, and alternatives while `research-sol-medium` traces code, dependencies, tests, and implementation constraints. Astra reconciles their evidence. Use `research-grok` only for targeted current external research.
- Give writable implementation, tests, and repairs to `implement-sol-high`. Repository work uses one dedicated task worktree, repository policies, and the gh stack.
- For authored-PR babysitting to merge-ready, use [paseo-pr-babysit](../paseo-pr-babysit/SKILL.md): GLM monitors, Sol repairs, and Opus reviews before the driver publishes. Its monitor heartbeat is owned by the GLM session.
- For peer PR reviews or an explicitly requested five-angle review, use [paseo-pr-review](../paseo-pr-review/SKILL.md). Its five seats replace the single-review route. An explicit `code-review` request retains that skill's two-axis workflow.
- For implementation checkpoints and other applicable Git candidates, have `review-opus` run `code-review` once. The driver and implementer do not duplicate its review.
- For nontrivial explanations of concepts, systems, workflows, decisions or comparisons, and human-facing HTML reports, use [html-deliverables](../html-deliverables/SKILL.md) automatically. `explainer-content-sol` drafts the Markdown at medium and `explainer-content-opus` reviews its substance at high; after content approval, `explainer-opus` builds the HTML at medium and `explainer-review-terra` reviews its presentation and fidelity at high. That skill owns the content and site approval gates and takes precedence over the generic implementation, review and documentation routes for this deliverable. Preserve an explicitly selected format or specialized visualization method; trivial facts stay concise.
- Use `docs-glm` for ordinary documentation from accepted evidence; explanatory deliverables follow `html-deliverables`.
- Reuse `paseo-advisor` for a second opinion and `paseo-committee` for a hard unresolved disagreement.

Before dispatching review or documentation, read [references/briefings.md](references/briefings.md) and satisfy its briefing contract.

Use this workflow without Dvandva. Ordinary authorized work proceeds directly. Preserve Matt's human-only skill boundaries. When the user selected a workflow whose next step needs an explicit command they have not invoked, tell the driver or main conversation which command is needed. Implementation alone never creates an `/implement` gate.

## Evidence and recovery

Paseo owns agent and session state. Keep only a concise handoff artifact: objective, acceptance, source pointers, agent/workspace IDs and roles, current revision, verification, consensus decisions with category, both verdicts and evidence pointers, unresolved findings, owner, and next action. Notifications are wake-ups; inspect artifacts and run acceptance checks before declaring completion.

After interruption or an ambiguous launch, inspect recorded Paseo state and reuse the existing session when appropriate. Build no separate workflow state engine around this policy.
