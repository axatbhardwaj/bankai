# Matt Pocock workflow routing

Apply within the skill the user has invoked. Read that installed skill as the source of its process; these rules assign its work rather than copying or replacing its method. The main conversation's selected model remains the driver under the routing policy's ownership rules.

Use the shared policy's Sonnet/Terra exploration route for bounded codebase questions during planning or implementation. Explorer evidence supports the assigned researchers and implementer; it does not substitute for the Opus/Sol research gate or change Sol implementation and Opus review ownership.

## Invocation and ownership

One user invocation in the driver authorizes delegation of the work inside that skill. Workers do not need the user to invoke the same skill again. The driver owns the invocation and briefs each worker on its portion and source pointers; it does not manufacture a new human invocation through a Paseo prompt. Preserve the skills' explicit-only settings and their decision checkpoints. Invoking `grill-with-docs` does not also invoke `to-spec` or `to-tickets`.

## Planning: grill-with-docs, to-spec and to-tickets

Use `fable-planner` as the persistent planning partner. The driver and Fable reconcile the problem, design choices, codebase constraints, test seams, spec and ticket dependencies. Use the same Fable advisor for consequential design. The driver conducts the user conversation and owns the final spec/tickets; the generic `docs-glm` route does not replace this planning ownership.

Use researchers independently to establish the facts:

- `research-opus`: requirements, authoritative documentation, prior decisions and alternatives.
- `research-sol-medium`: actual code paths, callers, dependencies, existing tests and implementation constraints.
- `research-web`: targeted current external questions when they arise. Give it a concrete question rather than launching it without a research need.

**Before finalizing or publishing with `to-spec`, require current findings from both Opus and Sol.** Collect them in parallel if missing. Reuse findings from the planning session when their sources, code revision and scope still apply; refresh changed or unsupported claims instead of repeating the whole investigation. Each finding must distinguish verified evidence, inference and unresolved questions, with source pointers the driver can inspect.

The driver and Fable reconcile those findings before the spec is ready, using Fable for design advice. Resolve material contradictions about requirements, code behavior, integration constraints or testing seams; surface missing evidence or an unresolved user decision rather than presenting an assumption as established fact. Preserve `to-spec`'s user confirmation of testing seams and tracker prerequisites. This gate adds research, not another generic interview or approval round.

When that reconciliation records driver and Fable agreement for a high-stakes decision captured by the accepted spec, it satisfies the consensus gate once. Record the driver's position and obtain Fable's independent assessment on the same evidence. Do not repeat it during implementation unless a later proposal materially deviates from the accepted decision.

For `to-tickets`, use the accepted spec and its evidence to check vertical slices and blocking edges. Research only newly exposed gaps or changed sources. Preserve the skill's user-approved ticket breakdown before publication. The planning stage does not start implementation without the corresponding user invocation.

## Implementation: implement

The driver orchestrates the complete ticket workflow. Sol owns all product code, tests and repairs, including one-line fixes; the ordinary low-impact direct-work exception does not apply inside this workflow. The driver may inspect evidence and run acceptance checks, but routes code changes back to Sol.

1. Read the full ticket, parent spec, relevant decisions, standards and dependency revisions. Resolve inputs required by the selected skill and the [review briefing contract](briefings.md). Assign one dedicated task worktree to `implement-sol-high`, with the skill's TDD/testing instructions, pre-agreed seams, acceptance criteria and source pointers.
2. Sol implements and verifies the work, then checkpoints the local candidate as a commit so Opus can review immutable bytes. This review checkpoint is not permission to push, publish or mark the ticket complete.
3. The driver dispatches `review-opus` against the candidate in a separate pinned checkout. Opus executes the `implement` skill's `code-review` step once, including its native Standards and Spec subagents, and applies the shared [simplicity checklist](simplicity-review.md) inside the same seat. The driver and Sol do not run a second full review, add a simplicity checkpoint agent, or replace it with the six-angle peer-PR workflow.
4. Opus returns an explicit APPROVE or REQUEST_CHANGES verdict bound to the candidate SHA, with the two axes distinguishable. Send required findings to the same Sol session for fixes and verification, then send the changed candidate to Opus. Repeat autonomously until accepted or a concrete blocker needs the user's decision. A revision change, including integration or rebase, invalidates the old acceptance.
5. Complete only when the final committed candidate satisfies ticket acceptance criteria, required checks pass for that candidate, Opus approves that exact revision with no unresolved required findings, and requested delivery is verified. Preserve the selected skill's full-suite check at the end; if review repairs changed code afterward, rerun the required final checks against the final candidate. Do not repeat checks for an unchanged candidate without a new reason.

Routine fix/review iterations need no repeated user approval. Report a real blocker with evidence and the next action rather than silently taking over Sol's work or substituting an unavailable reviewer. Keep review acceptance, PR publication, merge-readiness and actual merge distinct; each external action stays within the user's existing authority.

## Whole-spec implementation: implement-spec

The invoked `implement-spec` owns the ticket graph and integration lifecycle; do not add another scheduler. Map its implementation, repair and merge/integration workers to `implement-sol-high`, using its separate ticket worktrees and serialized integration. Map its final `code-review` step to `review-opus` on the combined branch. Apply the same Sol repair, Opus re-review and final-candidate checks above before marking that PR ready for review. A ticket assigned as a graph worker does not start a second whole-spec workflow.
