# Worker briefing contracts

Every brief names the selected profile and carries its relevant notes, objective, authoritative sources, constraints, acceptance criteria, expected artifacts, and required evidence. Resolve known preconditions in the main conversation before dispatch. A worker reports newly discovered gaps to the driver as evidence rather than opening a hidden user decision.

Reuse a same-task advisor when evidence or the plan materially changes or failure recurs. Give it the changed evidence pointers and prior assessment rather than restating the whole task. Fable provides planning and design advice.

## Exact-revision review

For the single `review-opus` route, the driver resolves and gives `review-opus`:

- the immutable candidate SHA and fixed-point or base SHA;
- the specification or acceptance-criteria pointer;
- applicable repository standards and tracker configuration;
- a separate checkout pinned to the candidate.

For an implementation checkpoint, include the [simplicity checklist](simplicity-review.md) inside the existing `review-opus` seat. Apply it alongside Standards and Spec; it does not create another checkpoint agent.

Missing review inputs are surfaced in the main conversation before dispatch. Never silently skip the Spec axis or leave a worker to ask for a missing precondition.

Opus invokes `code-review` once for that candidate. Its required native Standards and Spec subagents perform the independent review. Opus returns findings and its verdict bound to the candidate SHA. The driver and implementer do not duplicate this review. A changed revision is a new candidate and receives a new review. Formal GitHub review and merge mutations retain their own authority boundaries.

## Fable advice and high-stakes decisions

Give Fable the scoped question, proposal, constraints, evidence or revision pointers, and acceptance criteria. It returns a recommendation, risks, alternatives, evidence gaps, strongest counterargument, and acceptance checks. Ordinary advice informs the selected driver's decision and is not a veto.

For a high-stakes decision, the driver records its own position before reading Fable's independent assessment. Fable verifies at least one material claim and returns exactly AGREE, DISAGREE, or INSUFFICIENT EVIDENCE against the same evidence or revision. The driver and Fable must both record plain AGREE; conditional answers are unresolved. No Astra child or model-specific driver is required.

Record the category and reason, both positions, source pointers, evidence or revision identity, and focused-round count. Material changes invalidate the receipt. Allow at most two focused evidence rounds, then escalate the dependent decision with the question, both positions, evidence, resolving fact, and recommended default. Keep human authority and candidate review separate. Fable keeps product files unchanged and does not issue a candidate verdict.

## Documentation and explainers

For a requested visual artifact, use the installed upstream `visual-explainer` skill. The driver supplies audience, question, authoritative source pointers, scope, output path, delivery constraints, and resolved theme. An explicit per-request theme wins; otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Use full rendering for fixed `dark` or `light`, even if quick mode was requested, and explain the fallback. The generated output must remain on that selected theme regardless of the OS preference; when adapting an upstream template, remove or override any `prefers-color-scheme` block that could reverse it. For `system`, retain responsive theme media queries and quick mode remains available. Assign source-content or independent visual review profiles only when the artifact's risk warrants them. Do not require an intermediate Markdown file or digest gate.

For ordinary documentation, the `docs-glm` brief supplies acceptance criteria suited to the deliverable:

- put the answer or result, why it matters, and next action first;
- cite the source for material claims;
- return the artifact and evidence for the claims and requested checks.

Keep ordinary documentation proportional and in the requested format. Visual-explainer does not turn ordinary prose into HTML automatically.
