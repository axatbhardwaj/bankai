# Workspace placement

Apply this gate before every Paseo workspace or agent launch, independently of
the optional task lifecycle configuration. Workspace isolation and project
ownership are separate decisions. The selected workflow decides whether to
reuse a workspace or create isolated workspaces; this gate places either choice
under the existing project that owns the task target.

## Resolve the owner

1. Resolve the directory the worker will actually inspect or modify. For a Git
   checkout, record its canonical common directory with
   `git -C <checkout> rev-parse --path-format=absolute --git-common-dir` and
   identify the canonical main-checkout root that owns that common directory.
2. Read the existing Paseo project registry with its IDs and registered paths.
   For Git tasks, select the project registered at the canonical main-checkout
   root, then verify its Git common directory matches the target checkout. Do
   not select task, role, or other scratch projects merely because their linked
   checkouts have the same common directory. For non-Git tasks, select the
   existing project whose canonical registered root owns the target directory.
   For cross-repository work, select the target's project, not automatically the
   driver's project.
3. Treat no canonical match or multiple plausible canonical roots as a
   placement blocker. Report the target directory, Git identity when present,
   candidate projects, and the registry action needed from the driver or user.
   A task checkout or scratch directory is not a new project: never register one
   merely to make a launch succeed.

## Create, verify, launch

1. If the selected workflow reuses an existing workspace, verify through MCP
   `list_workspaces` that its `projectId` is the resolved owner and that its path
   is suitable for the task, then launch with that `workspaceId`.
2. If the selected workflow requires a new workspace, create it with both the
   selected path and resolved existing project ID. With tools, pass `projectId`
   to `create_workspace`. With the CLI, use:

   ```bash
   paseo workspace create --project <project-id> --isolation local --path <checkout> --title <title> --json
   ```

3. Before launching an agent in a new workspace, verify through MCP
   `list_workspaces` that the returned `workspaceId` is owned by the selected
   `projectId`. `paseo workspace ls --json` exposes only the project display
   name, so it cannot verify identity. Missing or mismatched ownership is a
   placement blocker.
4. Launch on the verified workspace ID. For a newly created workspace this is
   exactly the ID returned by creation. Pass `workspaceId` to `create_agent`;
   CLI launches use `paseo run --workspace <workspace-id> ...`.
   `paseo run --cwd <path>` is path lookup, not an ownership-safe fallback.

Task labels are metadata for naming, discovery, and cleanup after placement.
They do not establish project ownership or group independently created
workspaces.
