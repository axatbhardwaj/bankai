# Task lifecycle

Apply this convention only to future tasks whose valid
`~/.config/haoshoku/paseo-tasks.json` has `enabled: true`. Names and labels are
metadata for recognition; they do not promise native grouping or filtering in
the Paseo UI.

## Start a task

1. Read the full driver Paseo ID from `PASEO_AGENT_ID` and confirm it with
   `paseo inspect "$PASEO_AGENT_ID" --json`. Choose a human-readable task slug
   and a fresh run discriminator. Reuse a platform task/run ID when one exists;
   otherwise generate a UUID. Form one task ID as
   `<slug>--<full-driver-paseo-id>--<run-id>`. A later task gets a new run ID,
   including another run for the same PR under the same driver. If the ID is
   missing or cannot be inspected, do not guess: continue normal routing
   without lifecycle metadata or cleanup and report the tooling gap.
2. Start the explicit roster with the driver ID, role, and workspace. Add only
   real Paseo agent IDs returned by Paseo-managed launches for this run. The
   separate sessions launched by the Paseo PR skills are included. Keep the
   roster in the handoff; source roles and workspace IDs from launch receipts.
   Paseo remains the state owner.
3. Set only the shared task label on the driver and every Paseo roster member:

   ```bash
   paseo agent update "$agent_id" --label "haoshoku.task=$task_id" --json
   ```

   This preserves unrelated labels. Record the successful update receipt. A
   reused driver has one current `haoshoku.task` value; keep earlier run
   identity in its completed parent summaries rather than treating that label
   as history. `paseo.parent-agent-id` is reserved persisted parentage: read it,
   never set or rewrite it.
4. When `renameChats` is true, set each visible title to
   `<Task or PR> · <Role>`. Include a round where it distinguishes repeated
   work, such as `PR 123 · Review R2`:

   ```bash
   paseo agent update "$agent_id" --name "$task_title · $role" --json
   ```

   Name the first review attempt `Review R1` when another round is plausible,
   then advance `R<N>` for each distinct review attempt. If a suitable
   same-task Paseo session is reused, rename it; if the workflow launches a new
   Paseo session, add that returned ID to the roster.

5. After every Paseo-managed launch, inspect the returned ID with
   `paseo inspect "$agent_id" --json`. Record its actual `ParentAgentId`,
   `Status`, `PendingPermissions`, `Cwd`, and `Worktree`. Keep the role and
   workspace ID from the launch receipt and the task ID from the label-update
   receipt. For grandchildren, follow the inspected parent chain back to the
   driver.

Provider-native subagents, such as the Standards and Spec collaborators created
inside `code-review`, do not have independently inspectable Paseo IDs. Keep
their findings in the owning Paseo agent's report. Do not add their native IDs
to the roster or pass them to `paseo inspect`, `paseo agent update`, `paseo
stop`, or `paseo archive`. The owner's final report confirms those native
collaborators finished and includes their results before the owning Paseo agent
is eligible for cleanup.

`paseo ls --global --label "haoshoku.task=$task_id" --json` may rediscover
candidates after interruption. Intersect its result with the explicit roster
and inspected parent chain. A matching name, parent, PR, workspace, or label by
itself never adopts an agent. Do not infer or migrate chats that predate this
task run.

## Complete and clean up

The driver decides completion from role results and acceptance evidence. Idle
status is not completion.

1. Collect every non-driver roster member's final report. Record the exact
   revision or evidence set, verification, findings, and unresolved owner/next
   action in the driver summary; that summary is the driver's completion
   artifact.
2. Each worker owner quiesces its work, confirms it has no pending launches,
   native collaborators, waiting work, or further updates, and deletes its owned
   heartbeat before its final report. After recording their reports, stop
   task-owned monitor/watchdog agents by exact roster ID and confirm they are no
   longer running. Keep a worker that is waiting for user input, external work,
   or permission.

   ```bash
   paseo heartbeat delete "$heartbeat_id" --json
   paseo stop "$monitor_agent_id" --json
   ```
3. The driver confirms the task complete only after reports, acceptance checks,
   and owned monitor/heartbeat shutdown are recorded.
4. If `cleanup` is `keep`, retain every agent. If it is `archive`, exclude the
   driver and handle one explicit descendant at a time. A fresh
   `paseo ls --global --label "haoshoku.task=$task_id" --json` result must still
   contain that exact roster ID; use it only as a membership check, never as an
   archive list. Immediately inspect the same ID with
   `paseo inspect "$agent_id" --json`. Archive only when its parent chain still
   matches, `PendingPermissions` is empty, the inspected status plus the owner's
   final report show no running, error, permission, or waiting work, its role
   evidence is complete, and concurrent ownership or a pending launch has been
   excluded. Otherwise retain the worker.
5. Prefer the no-force command for that eligible descendant immediately after
   its checks, before checking the next ID:

   ```bash
   paseo archive "$agent_id" --json
   ```

   A refusal leaves the agent retained for the driver to report and reconcile.
   Paseo 0.7.2 checks `status === "running"` in a CLI preflight, then calls the
   archive API without a conditional status/version argument. No-force reduces
   risk but cannot guarantee atomic idle-only archival. Retain the worker when
   concurrent activity cannot be excluded; never retry with `--force`.

Never remove task labels during cleanup. Keep the parent, its summary history,
and its current task label; earlier parent-task identities remain in that
summary history. This lifecycle never deletes a workspace, hard-deletes an
agent, schedules a timer, or sweeps by parent or label alone. Phone and desktop
views connected to the same daemon see the same metadata; every independent
agent host needs its own Haoshoku configuration.
