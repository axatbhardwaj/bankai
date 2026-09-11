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
Fable Advisor at xhigh as the sole standing planning advisor; Astra xhigh remains
available on demand without a dedicated advisor profile or mandatory council.
High-stakes decisions require Fable's plain AGREE and the driver's accepted
assessment; Fable unavailability pauses that decision unless the user overrides
the gate. Assigned workers stay within their brief, and known mechanical work
stays direct.
Ordinary implementation and exact-candidate review default to medium; apply the
shared skill's per-launch high policy. This routing supersedes older
paired-orchestration and model-casting guidance.
