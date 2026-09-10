# Advisor Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add driver-neutral Fable/Astra advisor checkpoints and the exact Astra technical-advisor profile without changing existing workflow ownership.

**Architecture:** Keep profile synchronization generic and data-driven: the new role is one bundled profile, while the existing merge preserves every unmanaged live record. Express routing behavior in the owned model-routing skill and its two focused references, with portable policy and README summaries pointing agents and users to that source of truth.

**Tech Stack:** JSON profile policy, Markdown agent instructions, JavaScript/Bun tests, Biome.

**Spec:** `docs/superpowers/specs/2026-09-11-advisor-routing-design.md`

## Global Constraints

- Use the current isolated worktree and branch `brainstorm/sol56-high-driver` based on `79e662d1261a93ab714228cbf576bdfbc4bd0643`.
- Add only `technical-advisor`; preserve every other source profile ID and do not create a driver profile or change a default model.
- Keep live-only role IDs and secrets unmanaged and preserved by merge.
- Preserve unrelated visual, PR, lifecycle, review, publication, and human-decision workflows.
- Make local semantic commits around 200 lines; do not push, open a PR, merge, release, sync live state, or write outside the worktree.

---

### Task 1: Add and document driver-neutral advisor routing

**Files:**

- Modify: `tests/configure_paseo_profiles.test.js`
- Modify: `configs/paseo/agent-profiles.json`
- Modify: `configs/agent-skills/model-routing/SKILL.md`
- Modify: `configs/agent-skills/model-routing/references/briefings.md`
- Modify: `configs/agent-skills/model-routing/references/matt-workflows.md`
- Modify: `configs/codex/AGENTS.md`
- Modify: `configs/claude/CLAUDE.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: `mergePaseoPolicy(liveConfig, policy)` and the existing
  whitelist-only profile format.
- Produces: bundled profile ID `technical-advisor` and prose contracts for
  Fable planning, Astra technical advice, and Astra/Fable consensus.

- [x] **Step 1: Add failing profile and preservation tests**

Assert the new profile's exact runtime fields:

```js
expect(technicalAdvisor).toMatchObject({
	id: "technical-advisor",
	name: "Technical Advisor",
	provider: "codex",
	model: "gpt-6-astra",
	modeId: "full-access",
	thinkingOptionId: "high",
});
```

Add a live-policy merge scenario containing `planning-advisor`,
`implement-code`, `review-code`, and a custom profile with extra secret fields.
Assert those exact objects, provider credentials, and unrelated state survive,
and assert a second merge equals the first.

- [x] **Step 2: Add failing scenario-level routing tests**

Read the three model-routing Markdown files and validate short, stable behavior
anchors for these scenarios:

```text
Sol + substantial plan       -> actual fable-planner
Sol + consequential design   -> actual technical-advisor
Sol + high-stakes decision   -> Astra position, then actual Fable, both AGREE
Astra driver                 -> recorded self-assessment unless independence required
Routine mechanical work      -> stays direct
Required advisor unavailable -> dependent decision blocked
```

Also assert the profile set has no saved driver role and Fable's notes call it
the driver's planning partner.

- [x] **Step 3: Run the focused test and confirm the new assertions fail**

Run:

```bash
bun test tests/configure_paseo_profiles.test.js
```

Expected: failures for missing `technical-advisor` and missing new routing
contract language, while pre-existing tests remain green.

- [x] **Step 4: Add the exact technical-advisor profile**

Insert one profile in `configs/paseo/agent-profiles.json`:

```json
{
	"id": "technical-advisor",
	"name": "Technical Advisor",
	"provider": "codex",
	"model": "gpt-6-astra",
	"modeId": "full-access",
	"thinkingOptionId": "high"
}
```

Give it concise notes limiting output to scoped recommendations, risks,
alternatives, and acceptance checks, with no candidate review or implementation.
Change Fable's notes from Astra's partner to the driver's planning partner.

- [x] **Step 5: Implement routing and briefing contracts**

In `SKILL.md`, make driver ownership model-neutral, strengthen the Fable trigger
to substantial planning, add the consequential technical-design checkpoint and
Astra-driver exception, keep Astra-first/Fable-second high-stakes consensus,
and block only dependent decisions when either required advisor is unavailable.
Add reuse-at-changed-evidence and recurring-failure guidance without introducing
an orchestrator or automatic dual-advisor routing.

In `references/briefings.md`, define concise technical-advisor inputs and output,
the Astra-driver self-assessment receipt, and the unchanged independent-seat and
consensus evidence requirements. In `references/matt-workflows.md`, make the
driver the owner while applying Fable planning and Astra technical/consensus
checkpoints at their specific triggers.

- [x] **Step 6: Update portable policy and README summaries**

Replace the claim that Astra always drives in both portable policy files with
the selected-model driver rule and short Fable/Astra checkpoint summary. Update
the Agent and orchestration policy section in `README.md` to describe the new
profile and distinguish planning, technical advice, consensus, and review.

- [x] **Step 7: Run focused tests and commit the behavioral change**

Run:

```bash
bun test tests/configure_paseo_profiles.test.js tests/configure_agent_skills.test.js
```

Expected: all focused tests pass. Commit the cohesive profile, test, and routing
contract change with a semantic message.

- [x] **Step 8: Format changed files and run final verification**

Format only changed supported files, then run:

```bash
bun test
bun run lint
git diff --check
```

Expected: all commands pass. Inspect the final diff for unrelated changes,
confirm no live sync command ran, and commit any documentation-only follow-up as
a separate semantic commit.
