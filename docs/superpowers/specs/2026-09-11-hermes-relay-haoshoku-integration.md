# Haoshoku Hermes relay integration

Status: implemented locally; standalone relay publication pin pending.

## Entry points and host boundary

- `haoshoku --server-hermes-relay` is Debian-family only.
- Full Debian setup invokes it after successful native Paseo setup and Paseo
  profile sync. Relay failure makes the overall setup incomplete.
- Arch/Omarchy paths do not invoke the helper or create the relay marker.
- The helper writes `~/.config/haoshoku/hermes-relay.json` containing exactly
  version 1 and enabled true only after configuration, native enablement,
  validation, and any required activation succeed.
- Shared PR workflows must run `hermes-relay-host-enabled` before every relay
  CLI command, pending-state inspection, or escalation transport. Missing,
  malformed, disabled, or non-v1 markers mean the normal local Paseo
  conversation only, with no Hermes or remote calls.

## Runtime and source integrity

- Existing Hermes is validated and reused without upgrade or replacement.
- Missing Hermes is installed from the official installer at commit
  `67764dc0863349a384c16425e73ee8571f3a94b7` using `--commit` with
  `--skip-setup --skip-browser --skip-computer-use --non-interactive` and no
  layout override.
- Relay source is declared by `configs/hermes-relay/lock.json`. While its commit
  is null, only the in-repository vendored fallback is allowed. This transition
  state prevents a dependency on an unpublished repository.
- Finalization records the published `v0.1.0` commit, after which Haoshoku
  clones without checkout, checks out that exact commit, verifies `HEAD` and
  `v0.1.0^{commit}` equal the lock, and validates the plugin name/version and
  file allowlist. Mismatch is a hard failure.
- `HAOSHOKU_HERMES_RELAY_SOURCE` supports offline tests only after final pinning
  and receives the same Git commit, tag, manifest, and allowlist verification.

## Preservation and configuration

- Only allowlisted plugin files are deployed. A byte-changing update first
  backs up the whole existing plugin directory once.
- Hermes YAML, other plugins, authentication, relay SQLite database, anchors,
  backups, and unrelated files are preserved. Hermes native CLI owns plugin
  enablement; Haoshoku does not parse or rewrite YAML.
- `~/.local/bin/hermes-relay` is a symlink to the deployed wrapper. A regular
  file or foreign symlink is not replaced.
- Private relay config is mode 0600 and preserves unrelated settings. `serverId`
  comes only from a local, running, reachable `paseo status --json` with remote
  host environment overrides removed. An existing conflicting ID is rejected.
- Telegram IDs are reused or derived only from one unambiguous existing private
  owner/DM configuration. The bot token must already exist privately. Missing
  credentials return false with a manual checklist and never enable the plugin.

## Validation and activation

- Enablement uses Hermes 0.21.1 native `plugins enable` without tool-override
  permission, followed by native plugin doctor and relay doctor.
- Unchanged successful reruns preserve config/database/marker bytes and do not
  restart the gateway.
- Changed installs activate only when the gateway control socket confirms idle.
  Busy or unknown activity, noninteractive execution, a declined prompt, or a
  failed restart returns false and leaves the marker absent.
- No path restarts Paseo, interrupts active Hermes work, changes schedules, sends
  messages, or performs a live relay review.

## Pending publication transition

After the standalone repository is independently reviewed and published, update
the lock with its exact commit, verify both remote-fetch and offline-source tests,
then remove the vendored plugin directory and Haoshoku-owned Python relay tests.
Those deletions are intentionally excluded until the immutable SHA is supplied.
