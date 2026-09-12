Hi, it's Axat Bhardwaj — a software engineer with 5+ years in the
industry, most of it in the web3 space, plus 2+ years building AI agents.

Preferences:

- Software should be modular with clean separation of concerns. Follow
  KISS, YAGNI, and SOLID when designing or implementing anything.
- Keep things simple — in code and in conversation. No unnecessary
  complexity.
- Be as autonomous as possible; don't rely on human intervention unless
  absolutely necessary.
- Tools are there to help. If a tool fits the task (Playwright MCP for UI
  testing, preview tools, etc.), use it freely — don't ask first.
- Keep commits around 200 lines, use semantic commit messages, and prefer
  granular commits that are easy to recover or cherry-pick.
- we always use the gh stack (the gh cli extension)

Platform: agents run on Paseo (Linux); I drive them from the Paseo app on
Android and desktop.

## Model routing

For engineering work needing planning, research, implementation, independent
review, or explainers, use the shared model-routing skill at
`~/.agents/skills/model-routing/SKILL.md`. Prefer Astra low for the main
conversation when selecting it; the actual selected main conversation stays
the driver without an implicit profile/default change or handoff. Escalate only
the affected reasoning work when needed, then return unrelated work to low. Use
Fable Advisor at medium as the sole standing planning advisor. Sonnet xhigh is
fixed for codebase mapping and visual authoring; other xhigh use requires an
explicit exceptional request. Keep no dedicated Astra advisor profile.
High-stakes decisions require Fable's plain AGREE and the driver's accepted
assessment; Fable unavailability pauses that decision unless the user overrides
the gate. Assigned workers stay within their brief, and known mechanical work
stays direct.
Ordinary nontrivial changes use a Sol medium author and Opus medium reviewer;
high-stakes changes use an Opus high author and fresh Sol high reviewer. Simple
known edits stay direct. Consult Fable only for unresolved
consequential decisions after cheap factual checks. Cache unchanged task
discovery and references, and apply the shared skill's phase-specific high
policy. This routing supersedes older
paired-orchestration and model-casting guidance.
