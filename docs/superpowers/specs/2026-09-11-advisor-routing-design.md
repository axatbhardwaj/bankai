# Advisor Routing Design

## Goal

Make the main conversation's selected model the driver while adding two
proactive, distinct checkpoints: Fable for substantial planning and Astra for
consequential technical design. Preserve the existing Astra/Fable consensus
gate for new high-stakes decisions.

## Ownership and roles

- The main conversation owns scope, routing, execution, synthesis, decisions,
  recovery, and the final result. Its selected model is the driver; no saved
  driver profile or default-model change is introduced.
- `fable-planner` is the driver's planning partner. Use it before substantial
  planning: a written plan or acceptance decisions beyond a mechanical change,
  ambiguity, multiple credible approaches, boundary changes, conflicting
  evidence, or repeated failures. Routine known work does not qualify merely
  because it has a checklist.
- Add `technical-advisor` / `Technical Advisor` with provider `codex`, model
  `gpt-6-astra`, `full-access`, and `high` reasoning. Use it before consequential
  technical design involving module boundaries, data or API contracts,
  failure/concurrency handling, or security-relevant configuration. It returns
  a scoped recommendation, risks, alternatives, and acceptance checks; ordinary
  advice is not a veto, candidate review, or implementation.
- An Astra driver may record its own Astra assessment instead of creating a
  redundant `technical-advisor` child. An explicit independent-seat requirement
  still requires the separate advisor.
- Reuse a same-task advisor when evidence or the plan materially changes, and
  after recurring failure. Brief advisors concisely with evidence pointers; do
  not invoke both advisors automatically for every task.

## High-stakes consensus

Existing consensus classes, two focused evidence rounds, user authority, and
accepted-decision stability remain unchanged. For a new high-stakes decision,
obtain Astra's position first and then Fable's independent assessment against
the same evidence or revision. Proceed only when both record plain `AGREE`.
Either unavailable advisor blocks only the dependent decision; there is no
substitute or silent bypass.

An Astra driver may provide the recorded Astra position unless the workflow or
user explicitly requires an independent Astra seat. Fable remains a separate
actual advisor. Opus remains the independent candidate reviewer, and neither
advisor reviews or implements the candidate.

## Source and live identity boundary

Keep all existing source profile IDs (`fable-planner`, `implement-sol-high`,
`review-opus`, and the other bundled IDs). Add only `technical-advisor`. Live
role IDs such as `planning-advisor`, `implement-code`, and `review-code` are
unmanaged records during this source change and must survive policy merging
with their complete records and secrets. Do not run profile, skill, or backup
sync against the real home directory.

## Documentation surface

Update the model-routing skill, briefing contract, Matt workflow overlay,
portable Claude/Codex routing paragraphs, and relevant README descriptions.
Keep unrelated routing, visual-explainer, PR monitor, review, lifecycle, and
publication rules intact. Skill prose should express driver-neutral ownership;
only the Astra/Fable consensus position remains model-specific.

## Acceptance

- The bundled `technical-advisor` profile has the six exact identity/runtime
  fields above plus bounded notes, and no driver profile exists.
- Policy merge preserves custom and live role-ID profiles byte-for-value,
  preserves provider secrets and unrelated config, and is idempotent.
- Scenario checks cover a Sol driver doing substantial planning,
  consequential design, and high-stakes work; an Astra driver; routine
  mechanical work; and unavailable-advisor behavior.
- Focused tests, the full Bun suite, lint, formatting of changed files, and
  `git diff --check` pass, apart from any clearly unrelated baseline issue.
- Delivery is local commits only. No push, PR, merge, release, live sync, or
  outside-worktree write is performed.
