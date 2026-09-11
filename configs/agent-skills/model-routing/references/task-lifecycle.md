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
   real Paseo agent IDs backed by a driver-recorded launch or reuse receipt for
   this run. This includes supported CLI launches such as:

   ```bash
   paseo run --background --workspace "$workspace_id" \
     --label "haoshoku.task=$task_id" --json
   ```

   A CLI launch receipt remains valid when inspection reports a null
   `ParentAgentId`. The separate sessions launched by the Paseo PR skills are
   also included. Keep each receipt's exact agent ID, role, and workspace in
   the roster and handoff. To reuse an agent from an earlier
   run, settle the old run first: record the old roster's dispositions, then
   record the exact ID's
   fresh inspection as the reuse receipt and re-roster it for the new run.
   Paseo remains the state owner.
3. Set only the shared task label on the driver and every Paseo roster member:

   ```bash
   paseo agent update "$agent_id" --label "haoshoku.task=$task_id" --json
   ```

   This preserves unrelated labels. Record this run's exact task-label update
   receipt for every roster member; a launch-time label does not replace this
   receipt. A reused driver or worker has one current `haoshoku.task` value;
   keep earlier run identity in the completed driver summary rather than
   treating that label as history. `paseo.parent-agent-id` is reserved
   persisted parentage: read it, never set or rewrite it.
4. When `renameChats` is true, set each visible title to
   `<Task or PR> · <Role>`. Include a round where it distinguishes repeated
   work, such as `PR 123 · Review R2`:

   ```bash
   paseo agent update "$agent_id" --name "$task_title · $role" --json
   ```

   Name the first review attempt `Review R1` when another round is plausible,
   then advance `R<N>` for each distinct review attempt. Reuse a same-run Paseo
   session only by its exact roster ID and rename it. Cross-run reuse follows
   steps 2 and 3: settle, inspect, re-roster, and relabel the exact ID.

5. After every Paseo-managed launch or reuse, inspect the returned ID with
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
and recorded receipts, then apply the cleanup eligibility rules below. A
matching name, parent, PR, workspace, or label by itself never adopts an agent.
Do not infer or migrate chats that predate this task run.

## Complete and clean up

The driver decides completion from role results and acceptance evidence. Retain
every workflow chat while the run is active so it remains visible and reusable;
idle status or an interim/final role report alone is not completion.

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
3. The driver confirms the task complete only after all reports, acceptance
   checks, and owned monitor/heartbeat shutdown are recorded.
4. Run cleanup reconciliation as a mandatory exit step before the driver sends
   its complete final response, hands off, or is archived. Archival cleanup is
   available only after step 3. For an active handoff, retain the workflow
   workers and transfer the roster, receipts, evidence state, and next actions.
   Record the disposition and a concrete reason for every retained worker.
5. If `cleanup` is `keep`, retain every agent. If it is `archive`, exclude the
   driver and handle one explicit roster member at a time. A fresh
   `paseo ls --global --label "haoshoku.task=$task_id" --json` result must still
   contain that exact roster ID; use it only as a membership check, never as an
   archive list. Immediately inspect the same ID with
   `paseo inspect "$agent_id" --json` and classify its parentage:

   - A null `ParentAgentId` is eligible only when the exact ID is in the
     explicit driver roster and both its original driver-recorded launch or
     reuse receipt and this run's exact task-label update receipt are recorded.
   - A non-null parent chain is eligible only when inspection reaches this
     driver. A non-null mismatched parent chain is a hard retain condition.

   After parentage qualifies, archive only when `PendingPermissions` is empty,
   the inspected status plus the owner's final report show no running, error,
   permission, or waiting work, its role evidence is complete, and concurrent
   ownership or a pending launch has been excluded. Otherwise retain the worker
   with the failed eligibility check as its concrete reason.
6. Prefer the no-force command for that eligible roster member immediately after
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
