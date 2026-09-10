# Haoshoku Hermes relay integration

Status: finalized locally against the published standalone v0.2.0 release.

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
  public `v0.2.0` release commit
  `73846214657a165379a1698b6bccff6c9c9e484f`.
- Haoshoku clones without checkout, checks out that exact commit, verifies `HEAD`
  and `v0.2.0^{commit}` equal the lock, and validates the plugin name/version and
  file allowlist. Mismatch is a hard failure.
- `HAOSHOKU_HERMES_RELAY_SOURCE` supports offline verification and receives the
  same Git commit, tag, manifest, and allowlist checks.

## Preservation and configuration

- Only allowlisted plugin files are deployed, including the v0.2.0 `modes.py`
  module. A byte-changing update first backs up the whole existing plugin
  directory once.
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
  Busy activity defers only a required activation. Every incomplete attempt
  tries to revoke any marker, including activation deferred because the gateway
  is busy. Unknown activity, noninteractive execution, a declined prompt, or a
  failed restart also returns false and attempts revocation. If filesystem
  permissions deny removal, that revocation error is reported without replacing
  the original incomplete result; the operator must repair marker ownership.
  This prevents a stopped or unreachable unchanged gateway from retaining active
  transport status under normal user-owned permissions.
- No path restarts Paseo, interrupts active Hermes work, changes schedules, sends
  messages, or performs a live relay review.

## Transport modes

- The installed plugin key and private data path remain `paseo-review-relay`.
- Bundled PR workflows explicitly submit `mode: "pr"`. The relay requires the PR
  to remain open at its stored head and base before forwarding a fixed decision
  receipt, and the persistent owner revalidates the receipt and live PR again
  before acting.
- Generic `mode: "conversation"` receipts are opt-in delivery only. They never
  activate local work; the persistent owner must revalidate authority, context,
  and live state before any action. With no configured receipt words, replies
  remain questions.

## Publication evidence

The standalone generic R2 review approved candidate
`5a1bbc360d22f2970cbc742c6c5b60851f6d4dde`. Public main and the peeled `v0.2.0`
tag resolve to merged commit `73846214657a165379a1698b6bccff6c9c9e484f`,
whose tree is `4ee0939236e054120c54af51455c60aa7966a5d3`. GitHub PR CI run
`34530520814` and merged-main run `34530636905` succeeded. Haoshoku verified
both a real remote fetch and an offline source override, including deployment of
`modes.py`.
