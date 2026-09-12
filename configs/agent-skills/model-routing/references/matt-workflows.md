# Matt Pocock workflow routing

Apply within the skill the user has invoked. Read that installed skill as the source of its process; these rules assign its work rather than copying or replacing its method. The main conversation's selected model remains the driver under the routing policy's ownership rules.

Use the shared policy's Sonnet/Terra exploration route only for distinct unresolved codebase questions during planning or implementation. Explorer evidence supports the assigned researchers and implementer; it does not substitute for a selected workflow's research gate or change the selected implementation pair.

## Invocation and ownership

One user invocation in the driver authorizes delegation of the work inside that skill. Workers do not need the user to invoke the same skill again. The driver owns the invocation and briefs each worker on its portion and source pointers; it does not manufacture a new human invocation through a Paseo prompt. Preserve the skills' explicit-only settings and their decision checkpoints. Invoking `grill-with-docs` does not also invoke `to-spec` or `to-tickets`.

## Planning: grill-with-docs, to-spec and to-tickets

Use the same `planning-advisor` session only when the shared planning-advice trigger is met. Give it a compact source-linked decision brief with changed evidence; the driver records its assessment before reading the response and owns the final spec or tickets. Settled choices do not get a renewed consultation. The generic `docs` route does not replace this planning ownership.

Choose the researcher that matches the unresolved question:

- `research-requirements`: requirements, authoritative documentation, prior decisions and alternatives.
- `research-code`: actual code paths, callers, dependencies, existing tests and implementation constraints.
- `research-web`: targeted current external questions when they arise. Give it a concrete question rather than launching it without a research need.

Before finalizing or publishing with `to-spec`, require current source-backed findings. One appropriate researcher is the default; add another only for a distinct unresolved question or high-risk independent validation. Reuse findings from the planning session when their sources, code revision and scope still apply; refresh changed or unsupported claims instead of repeating the whole investigation. Each finding must distinguish verified evidence, inference and unresolved questions, with source pointers the driver can inspect.

The driver applies the planning-advice triggers while reconciling those findings before the spec is ready. Resolve material contradictions about requirements, code behavior, integration constraints or testing seams with targeted evidence; surface an unresolved correctness or dependent user decision rather than presenting an assumption as established fact. Preserve `to-spec`'s user confirmation of testing seams and tracker prerequisites. This gate adds research, not another generic interview or approval round.

When reconciliation records the driver's accepted assessment and plain AGREE from `planning-advisor` for a high-stakes decision captured by the accepted spec, it satisfies the gate once. An unavailable planning advisor pauses only that dependent high-stakes decision unless the user explicitly overrides the gate. Reuse the evidence-bound decision during implementation unless a later proposal materially deviates from it.

For `to-tickets`, use the accepted spec and its evidence to check vertical slices and blocking edges. Research only newly exposed gaps or changed sources. Preserve the skill's user-approved ticket breakdown before publication. The planning stage does not start implementation without the corresponding user invocation.

## Implementation: implement

The driver orchestrates the complete ticket workflow. Select the pair at intake under the shared [implementation-pair policy](../SKILL.md#implementation-pairs). The selected author owns all product code, tests and repairs, including one-line fixes; the ordinary low-impact direct-work exception does not apply inside this workflow. The driver may inspect evidence and run acceptance checks, but routes code changes back to the same author session for fixes.

1. Read the full ticket, parent spec, relevant decisions, standards and dependency revisions once, then cache unchanged references. Resolve inputs required by the selected skill and the [review briefing contract](briefings.md). Assign one dedicated task worktree to `implement-code`, with the skill's TDD/testing instructions, pre-agreed seams, acceptance criteria and compact source pointers. Select effort using the shared [reasoning policy](../SKILL.md#reasoning-effort).
2. The selected author implements and verifies the work, then checkpoints the local candidate as a commit so the independent reviewer can inspect immutable bytes. This review checkpoint is not permission to push, publish or mark the ticket complete.
3. The driver dispatches the selected `review-code` session against the candidate in a separate pinned checkout, using the shared [reasoning policy](../SKILL.md#reasoning-effort). The reviewer covers Standards, Spec and the shared [simplicity checklist](simplicity-review.md) directly. Invoking `/implement` alone does not launch nested review agents. A direct user invocation of `code-review` or explicit full parallel review retains the upstream two-axis native-subagent method. The driver and author do not duplicate the review or replace it with the six-angle peer-PR workflow.
4. The reviewer returns an explicit APPROVE or REQUEST_CHANGES verdict bound to the candidate SHA, with Standards and Spec distinguishable. Send required findings to the same author session for fixes and verification, then reuse the same reviewer for the exact delta and affected coverage. Run a full re-review only for substantive scope, base or behavior change, after a mid-session ownership transfer, or when the user explicitly selected a full-review method. Never reuse approval without a refreshed SHA receipt. Repeat autonomously until accepted or a concrete blocker needs the user's decision.
5. Complete only when the final committed candidate satisfies ticket acceptance criteria, required checks pass for that candidate, the selected reviewer approves that exact revision with no unresolved required findings, and requested delivery is verified. Preserve the selected skill's full-suite check at the end; if review repairs changed code afterward, rerun the required final checks against the final candidate. Do not repeat checks for an unchanged candidate without a new reason.

Routine fix/review iterations need no repeated user approval. Report a real blocker with evidence and the next action rather than silently taking over the author's work or substituting an unavailable reviewer. Keep review acceptance, PR publication, merge-readiness and actual merge distinct; each external action stays within the user's existing authority.

## Whole-spec implementation: implement-spec

The invoked `implement-spec` owns the ticket graph and integration lifecycle; do not add another scheduler. Select one pair for the whole specification graph at intake. Map every ticket, repair and merge/integration author to that implementation family, using separate ticket worktrees and serialized integration. Map the final `code-review` step on the combined branch to a fresh opposite-family reviewer at high effort that authored nothing anywhere in the combined candidate. Apply the same-author fixes, independent re-review and final-candidate checks above before marking that PR ready for review. A ticket assigned as a graph worker does not start a second whole-spec workflow. If genuinely mixed authoring or mid-spec escalation is needed, checkpoint the graph and ownership transfer explicitly; the final reviewer must have contributed nothing to the candidate.
