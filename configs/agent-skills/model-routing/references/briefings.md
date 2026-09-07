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

## Documentation and explainers

The `docs-muse` brief supplies concrete authoring and rendering acceptance criteria:

- put the answer or result, why it matters, and next action first;
- cite the source for material claims;
- for HTML, render desktop and mobile views and inspect readability and overflow;
- return actual render evidence, including inspected artifact paths or URLs, viewport sizes, and the observed result.

State these as prose acceptance criteria suited to the deliverable. Do not fork, rename, or depend on a Dvandva DOM template or validator, and do not prescribe a generic HTML skeleton.
