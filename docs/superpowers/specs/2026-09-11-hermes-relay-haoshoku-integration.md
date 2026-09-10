# Haoshoku Hermes relay integration

Status: finalized locally against the published standalone v0.1.0 release.

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
- Relay source is declared by `configs/hermes-relay/lock.json` and pinned to the
  public `v0.1.0` release commit
  `1f2761cbc75ef24e8e2287f49ba56dd819923388`.
- Haoshoku clones without checkout, checks out that exact commit, verifies `HEAD`
  and `v0.1.0^{commit}` equal the lock, and validates the plugin name/version and
  file allowlist. Mismatch is a hard failure.
- `HAOSHOKU_HERMES_RELAY_SOURCE` supports offline verification and receives the
  same Git commit, tag, manifest, and allowlist checks.

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
- The enabled marker is also the persistent activation receipt. A missing or
  invalid marker keeps activation pending across process reruns even when the
  second run has no file, config, link, or enablement changes.
- Every successful run freshly confirms that the gateway is running. Unchanged
  successful reruns with a valid marker may be idle or busy; they preserve
  config/database/marker bytes and do not restart or interrupt the gateway.
- Changed installs activate only when the gateway control socket confirms idle.
  Busy activity defers only a required activation. Unknown activity,
  noninteractive execution, a declined prompt, or a failed restart returns false
  and removes any preexisting marker. This also prevents a stopped or unreachable
  unchanged gateway from retaining active transport status.
- No path restarts Paseo, interrupts active Hermes work, changes schedules, sends
  messages, or performs a live relay review.

## Publication evidence

The standalone R2 review approved commit
`1f2761cbc75ef24e8e2287f49ba56dd819923388`; public main and peeled tag `v0.1.0`
resolve to that SHA, and GitHub CI run `34524156091` succeeded at it. Haoshoku
verified both a real remote fetch and an offline source override before removing
the transitional vendored plugin and duplicate Python bridge tests.
