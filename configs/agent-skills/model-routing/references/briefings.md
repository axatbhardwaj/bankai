# Worker briefing contracts

Every brief names the selected profile and carries its relevant notes, objective, authoritative sources, constraints, acceptance criteria, expected artifacts, and required evidence. Resolve known preconditions in the main conversation before dispatch. A worker reports newly discovered gaps to the driver as evidence rather than opening a hidden user decision.

For implementation and review, record the effort selected under the shared [reasoning policy](../SKILL.md#reasoning-effort) and the reason for any per-launch high override.

Reuse same-task Decision Council sessions when evidence or the plan materially changes. Give them changed evidence pointers and the prior receipt rather than restating the whole task.

## Exact-revision review

For the single `review-code` route, the driver resolves and gives `review-code`:

- the immutable candidate SHA and fixed-point or base SHA;
- the specification or acceptance-criteria pointer;
- applicable repository standards and tracker configuration;
- a separate checkout pinned to the candidate.

For an implementation checkpoint, include the [simplicity checklist](simplicity-review.md) inside the existing `review-code` seat. Apply it alongside Standards and Spec; it does not create another checkpoint agent.

Missing review inputs are surfaced in the main conversation before dispatch. Never silently skip the Spec axis or leave a worker to ask for a missing precondition.

Opus invokes `code-review` once for that candidate. Its required native Standards and Spec subagents perform the independent review. Opus returns findings and its verdict bound to the candidate SHA. The driver and implementer do not duplicate this review. A changed revision is a new candidate and receives a new review. Formal GitHub review and merge mutations retain their own authority boundaries.

## Decision Council

The driver records its own assessment before reading advisor outputs. Give `planning-advisor` and `technical-advisor` the same source-linked question and evidence, constraints, and acceptance criteria without a preferred answer. Run their independent first positions in parallel. Each returns exactly AGREE, DISAGREE, or INSUFFICIENT EVIDENCE with evidence pointers, the strongest counterargument, and a targeted resolving check.

Ordinary disagreement is resolved with the targeted check or new evidence. Residual preference uses a safe, reversible, in-scope convention. Unresolved correctness requires an experiment, or the dependent human decision when no experiment is available.

For a high-stakes decision, both advisors must return plain `AGREE`, and the driver must record its accepted assessment against the same evidence. Driver dissent starts another evidence round. Allow at most two focused evidence rounds, then escalate only the dependent decision with the question, three positions, evidence, resolving fact, and recommended default. Missing either advisor pauses only the dependent decision; use no substitute. Existing explicit authority remains valid until a material deviation.

Record the decision, council status, advisor verdicts, source pointers, evidence or revision identity, resolving result, and focused-round count in the existing handoff. Material changes invalidate the receipt. Advisors keep files unchanged, create no children, and do not issue candidate-review verdicts; Opus review remains separate.

## Documentation and explainers

For a requested visual artifact, use the installed upstream `visual-explainer` skill. The driver supplies audience, question, authoritative source pointers, scope, output path, delivery constraints, and resolved theme. An explicit per-request theme wins; otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Use full rendering for fixed `dark` or `light`, even if quick mode was requested, and explain the fallback. The generated output must remain on that selected theme regardless of the OS preference; when adapting an upstream template, remove or override any `prefers-color-scheme` block that could reverse it. For `system`, retain responsive theme media queries and quick mode remains available. Assign source-content or independent visual review profiles only when the artifact's risk warrants them. Do not require an intermediate Markdown file or digest gate.

For ordinary documentation, the `docs` brief supplies acceptance criteria suited to the deliverable:

- put the answer or result, why it matters, and next action first;
- cite the source for material claims;
- return the artifact and evidence for the claims and requested checks.

Keep ordinary documentation proportional and in the requested format. Visual-explainer does not turn ordinary prose into HTML automatically.
