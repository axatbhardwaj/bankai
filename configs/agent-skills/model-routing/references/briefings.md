# Worker briefing contracts

Every worker receives a compact, source-linked brief: selected profile and relevant notes, objective, authoritative pointers, constraints, acceptance criteria, expected artifacts, and required evidence. Prefer pointers and changed evidence over transcript copies. Resolve known preconditions in the main conversation before dispatch. A worker reports newly discovered gaps to the driver as evidence rather than opening a hidden user decision.

For implementation and review, record the selected [implementation pair](../SKILL.md#implementation-pairs), each session identity, and the reason for a high-stakes selection or per-launch effort override.

Reuse the same-task planning-advisor session when evidence or the plan materially changes. Give it changed evidence pointers and the prior receipt rather than restating the whole task. Reuse cached reads of unchanged skill references.

## Exact-revision review

Independence is session-based: the reviewer must have authored none of the candidate, including uncommitted changes, tests, integration work and draft responses in scope. A different model label does not make an author session independent. Use a separate checkout pinned to the immutable candidate. A fresh session may use a model family seen earlier in the task only when that session contributed nothing to the reviewed candidate.

For the single `review-code` route, the driver resolves and gives `review-code`:

- the immutable candidate SHA and fixed-point or base SHA;
- the specification or acceptance-criteria pointer;
- applicable repository standards and tracker configuration;
- a separate checkout pinned to the candidate.

For an implementation checkpoint, include the [simplicity checklist](simplicity-review.md) inside the existing `review-code` seat. Apply it alongside Standards and Spec; it does not create another checkpoint agent.

Missing review inputs are surfaced in the main conversation before dispatch. Never silently skip the Spec axis or leave a worker to ask for a missing precondition.

For the ordinary pair, Opus covers Standards, Spec and simplicity directly in one session. For the high-stakes pair, a fresh Sol high session covers the same axes. The reviewer returns findings and its verdict bound to the candidate SHA. The upstream `code-review` two-axis subagent method remains opt-in when the user explicitly selects it or requests a full parallel review. The driver and implementer do not duplicate the review.

## Mid-session escalation

When high-stakes risk emerges after the ordinary Sol author has begun writing, checkpoint the candidate and evidence, stop concurrent authorship, and record the ownership boundary. If the driver selects the high-stakes pair, transfer implementation ownership to an Opus high session. The former author session cannot review the result; launch a fresh Sol high reviewer that authored none of the candidate. The first review after the handoff covers the full candidate. Later unchanged-scope revisions may use delta review under the rules below. This transfers worker ownership, not the main conversation.

For a changed candidate, reuse the same reviewer with the prior receipt, exact delta and affected coverage. A substantive scope, base or behavior change receives a full re-review; an explicitly selected skill may also require one. Never reuse approval without a refreshed SHA receipt. Existing tests and checks may be reused only while the revision is unchanged. Formal GitHub review and merge mutations retain their own authority boundaries.

## Planning advisor

The driver records its own assessment before reading the advisor output. Give `planning-advisor` the source-linked question and evidence, constraints, and acceptance criteria without a preferred answer. It returns exactly AGREE, DISAGREE, or INSUFFICIENT EVIDENCE with evidence pointers, the strongest counterargument, and a targeted resolving check.

Ordinary disagreement is resolved with the targeted check or new evidence. Residual preference uses a safe, reversible, in-scope convention. Unresolved correctness requires an experiment, or the dependent human decision when no experiment is available.

For a high-stakes decision, `planning-advisor` must return plain `AGREE`, and the driver records its accepted assessment against the same evidence. Driver dissent starts another evidence round. Allow at most two focused evidence rounds, then escalate only the dependent decision with the question, positions, evidence, resolving fact, and recommended default. An unavailable planning advisor pauses only the dependent high-stakes decision unless the user explicitly overrides this gate. Existing explicit authority remains valid until a material deviation.

Record the decision, advisor status, verdict, source pointers, evidence or revision identity, resolving result, and focused-round count in the existing handoff. Material changes invalidate the receipt. The advisor keeps files unchanged, creates no children, and does not issue candidate-review verdicts; candidate review remains with the independent session selected by the implementation pair.

## Documentation and explainers

For a requested visual artifact, use the installed upstream `visual-explainer` skill. The driver supplies audience, question, authoritative source pointers, scope, output path, delivery constraints, and resolved theme. An explicit per-request theme wins; otherwise read `~/.config/haoshoku/visual-explainer.json` and default to `dark`. Use full rendering for fixed `dark` or `light`, even if quick mode was requested, and explain the fallback. The generated output must remain on that selected theme regardless of the OS preference; when adapting an upstream template, remove or override any `prefers-color-scheme` block that could reverse it. For `system`, retain responsive theme media queries and quick mode remains available. Assign source-content or independent visual review profiles only when the artifact's risk warrants them. Do not require an intermediate Markdown file or digest gate.

For ordinary documentation, the `docs` brief supplies acceptance criteria suited to the deliverable:

- put the answer or result, why it matters, and next action first;
- cite the source for material claims;
- return the artifact and evidence for the claims and requested checks.

Keep ordinary documentation proportional and in the requested format. Visual-explainer does not turn ordinary prose into HTML automatically.
