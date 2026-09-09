# Worker briefing contracts

Every brief names the selected profile and carries its relevant notes, objective, authoritative sources, constraints, acceptance criteria, expected artifacts, and required evidence. Resolve known preconditions in the main conversation before dispatch. A worker reports newly discovered gaps to the driver as evidence rather than opening a hidden user decision.

## Exact-revision review

For the single `review-opus` route, the driver resolves and gives `review-opus`:

- the immutable candidate SHA and fixed-point or base SHA;
- the specification or acceptance-criteria pointer;
- applicable repository standards and tracker configuration;
- a separate checkout pinned to the candidate.

Missing review inputs are surfaced in the main conversation before dispatch. Never silently skip the Spec axis or leave a worker to ask for a missing precondition.

Opus invokes `code-review` once for that candidate. Its required native Standards and Spec subagents perform the independent review. Opus returns findings and its verdict bound to the candidate SHA. The driver and implementer do not duplicate this review. A changed revision is a new candidate and receives a new review. Formal GitHub review and merge mutations retain their own authority boundaries.

## High-stakes decision consensus

For a consensus-class decision, record Astra's position before reading Fable's. Brief Fable with the question, category and reason, evidence pointers, Astra's proposal, and the revision or evidence set being assessed. End the brief with the bounded no-edits scope. Fable independently verifies at least one material claim with a source pointer, states the strongest concrete counterargument and whether it survives, identifies evidence gaps, and returns exactly `AGREE`, `DISAGREE`, or `INSUFFICIENT EVIDENCE`. A conditional answer counts as unresolved.

The receipt records the category and reason, both positions, evidence pointers, revision or evidence set, and focused-round count. A material evidence or revision change makes it stale. Use at most two focused evidence rounds after the initial assessments. If Fable is unavailable or plain agreement is still missing, stop only the dependent decision and give the human an escalation containing the question, both positions, evidence pointers, resolving fact, and recommended default. When Fable raises a plausible high-stakes flag that the driver rejects, preserve the rejected classification and reason in the receipt.

Fable can inspect relevant code or diffs as evidence for the decision, but does not review the whole candidate, run `code-review`, or issue a candidate verdict. Opus remains the independent candidate reviewer. Advisor and committee profiles do not replace either side of consensus.

## Documentation and explainers

For a requested visual artifact, use the installed upstream `visual-explainer` skill. The driver supplies audience, question, authoritative source pointers, scope, output path, delivery constraints, and resolved theme. An explicit per-request theme wins; otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Use full rendering for fixed `dark` or `light`, even if quick mode was requested, and explain the fallback; `system` may use quick mode. Assign source-content or independent visual review profiles only when the artifact's risk warrants them. Do not require an intermediate Markdown file or digest gate.

For ordinary documentation, the `docs-glm` brief supplies acceptance criteria suited to the deliverable:

- put the answer or result, why it matters, and next action first;
- cite the source for material claims;
- return the artifact and evidence for the claims and requested checks.

Keep ordinary documentation proportional and in the requested format. Visual-explainer does not turn ordinary prose into HTML automatically.
