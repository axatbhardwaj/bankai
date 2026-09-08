<p align="center">
  <img src="icons/haoshoku-readme.gif" alt="Haoshoku" width="100%">
</p>

# Haoshoku: Color of the Supreme King

Haoshoku is a personal, modular setup toolkit for Arch-family desktops and
Debian servers. Its desktop path is designed around Omarchy: Haoshoku installs
applications and portable developer configuration while Omarchy remains the
owner of the desktop experience. The desktop path requires Omarchy 4
(Quattro) or newer; Omarchy 3 is no longer supported.

## Install

```bash
git clone https://github.com/axatbhardwaj/haoshoku.git
cd haoshoku
bun install
bun link
haoshoku --os arch
```

`bun haoshoku.js --os arch` works without creating a global link. The legacy
`--os cachyos` spelling is accepted with a deprecation warning.

## Arch and Omarchy behavior

The Arch setup:

- authenticates sudo once up front and keeps that authorization alive with
  silent, non-interactive refreshes until setup finishes or aborts. Later
  Haoshoku sudo calls are non-interactive and fail instead of prompting again;
- performs a full system upgrade before package installation through
  `omarchy update -y` on Omarchy or `pacman -Syu` on other Arch-family
  systems, aborting setup if that preflight fails;
- prefers Omarchy's `yay`, falls back to `paru`, and bootstraps an AUR helper
  only when neither is available;
- uses `pacman` for repository packages and the AUR helper only for AUR
  packages;
- batches repository and AUR packages, filters missing targets, and retries only
  still-uninstalled packages individually when a batch fails;
- installs only JetBrains Mono Nerd Font instead of the conflicting complete
  Nerd Font group;
- installs the AUR `paseo-bin` desktop app, launches `/usr/bin/paseo` at login,
  and binds `Super+T` to its exact `Paseo` window class. The absolute desktop
  path prevents a user-installed Paseo CLI in `~/.local/bin` from shadowing it;
- keeps Bash as the account shell and adds portable aliases and tool
  initialization through `~/.config/haoshoku/bashrc`;
- preserves Omarchy's `.bashrc`, lock screen, and core Quickshell/Hyprland
  configuration. It asks Omarchy to apply the pinned Elysian theme, selected
  background, and font from `configs/omarchy/appearance.json`; it does not
  copy generated `current/theme` state between machines. Displaced Omarchy
  keybindings are
  relocated or explicitly superseded and documented in
  [`configs/omarchy/keybinding-swaps.json`](configs/omarchy/keybinding-swaps.json),
  the canonical swap record;
- deploys `~/.config/hypr/haoshoku/{bindings,workspaces}.lua` and appends
  exactly two `require` lines to `~/.config/hypr/hyprland.lua`; Omarchy 4
  loads user config via `require()` and no longer sources `.conf` files;
- automatically determines `pc` or `laptop` from Linux DMI chassis data, with
  battery detection as the fallback, and saves it to `~/.haoshoku.json` before
  device-routed audio and Hyprland configuration. A valid stored choice wins,
  so `haoshoku --device-type pc|laptop` remains the explicit override. Only
  ambiguous hardware falls back to the interactive selector; Skip persists
  nothing and leaves device-specific audio unset;
- keeps Claude stay-awake, PR watch, and the Matt Pocock skill set as portable
  setup steps. Full setup asks before Claude Remote Control and automatic git
  worktree cleanup; both default to No. The worktree offer explains that it enables a
  persistent weekly timer running
  `cleanup-worktrees.sh --apply`, which deletes eligible worktrees. Without
  interactive confirmation—including piped stdin—Haoshoku declines these real
  user decisions immediately and does not treat input as answers;
- adds a device-routed behavior-only Lua workspace overlay. The hyprmoncfg
  plugin owns the generated `~/.config/hypr/monitors.lua`; Haoshoku owns only
  `~/.config/hyprmoncfg/profiles/*.json`, the source profile JSON that
  hyprmoncfg reads to generate that Lua file, and never writes
  `monitors.lua` directly. Monitor-bound workspace rules live in the
  hyprmoncfg PC profile, matched by hardware identity instead of connector
  name so they survive DP connector swaps; laptop workspace rules are
  monitor-independent and remain in the Lua overlay;
- adds two-key special-workspace toggles under `Super`: A Haki (the tagged Warp
  `haki` tab), I AI assistants (Claude Desktop and Codex Desktop) on ordinary
  workspace 1,
  M music, O 1Password, G communication, B Flux Brave Origin,
  D DeFi Brave Origin,
  S stash, and `Super+Shift+X` X (`Super+Shift+S` stashes the focused window);
  see the canonical swaps JSON above for every Omarchy default relocated or
  superseded to make room;
- starts Steam and Omakade silently on gaming workspace 2 at login, binds
  `Super+2` to Omakade, and keeps `Super+Shift+G` as the gaming-workspace
  toggle that ensures Steam. Use
  `haoshoku-gaming-workspace place -- %command%` as a Steam launch option to
  move the launched game's process-tree windows there;
- starts Flux, DeFi, WhatsApp, and Notion with empty Brave Origin profiles
  below `~/.config/brave-haoshoku/`; existing Chromium profile data remains
  untouched at `~/.config/chromium-haoshoku/` for manual import;
- installs packaged Omazed and safely points Zed at its generated theme so Zed
  follows the active Omarchy palette. Haoshoku never runs Omazed's manual
  installer or deletes unrelated Zed themes;
- adds a non-locking `Screens Off` command to every paired KDE Connect device.
  It turns off all Hyprland displays through DPMS; keyboard or mouse input, or
  an existing phone-side Wake command, turns them back on. Pair new phones
  first, then run `haoshoku --kde-connect-commands` to add the command;
- continues after individual optional application failures and reports them.

Haoshoku deliberately does not configure Fish, KDE Plasma, KWin, SDDM, or
arbitrary application themes. Omarchy remains responsible for generating and
applying all files downstream of the declared appearance.

## Omarchy appearance

[`configs/omarchy/appearance.json`](configs/omarchy/appearance.json) declares a
public theme repository at an immutable Git commit, one background filename
inside that theme, and the font family. Full Arch setup and
`haoshoku --omarchy-appearance` reconcile the theme under
`~/.config/omarchy/themes/`, then call Omarchy's own theme, background, and font
commands.

An existing checkout from another repository is never replaced. A matching
checkout with local changes is preserved and applied as-is; a clean matching
checkout advances to the declared commit. The manifest may identify exact
legacy revisions from older local-origin installs. Those recognized checkouts
are moved to a timestamped sibling backup before Haoshoku installs the clean
pinned theme, and a failed install restores the original checkout. This keeps
custom work recoverable while making a fresh laptop reproduce the tracked
appearance.

## Omarchy plugins

On Arch-family desktops, Haoshoku installs the plugins listed in
[`common/omarchy-plugins.json`](common/omarchy-plugins.json) by running
`omarchy plugin add <url> --enable --yes` for each one. Each repository is
cloned and enabled at its current default branch HEAD — there is no commit
or tag pinning. An entry may declare `disableOnInstall` to switch off a stock
widget it replaces. That list is applied only when Haoshoku first creates the
plugin and is never re-applied, so a user can re-enable a displaced widget
without a later Haoshoku run overriding the choice. Every run otherwise
reconciles manifest plugins back to installed and enabled. If
`omarchy plugin list --json` cannot provide a trustworthy snapshot, the helper
performs no plugin work and returns `snapshotUnavailable: true`; the
side-effect-free manual-auth checklist is still printed.

These plugins run as arbitrary, unsandboxed code inside the long-lived
omarchy-shell process — the same risk Omarchy's own CLI warns about when
adding plugins manually. The `--yes` flag is passed deliberately so setup
stays unattended and non-interactive; this also suppresses Omarchy's
per-plugin confirmation/warning prompt, so only add this manifest to
machines where you trust and have reviewed those repositories. Plugins
that need manual setup afterwards (API tokens, OAuth, device pairing) are
printed as a manual-auth checklist after installation.
The Galaxy Buds plugin is installed from `aislandener/galaxy-buds-control` and
reports Bluetooth pairing in that checklist; it requires no credentials.
Agent Usage Plus replaces both Omarchy's stock `omarchy.agents` widget and the
older `robzolkos.agent-usage` plugin. The full Arch setup deploys its required
`~/.local/bin/omarchy-agent-usage-update` wrapper before installing plugins. If
running only selected steps, run `haoshoku --scripts` before
`haoshoku --omarchy-plugins`. That wrapper also scopes the Omarchy 4.0.0 Codex
collector's retired `-a untrusted` compatibility translation to usage refreshes;
ordinary Codex commands still execute the user's normal binary unchanged.

## Omarchy bar

Use `haoshoku --omarchy-bar` to deploy `configs/omarchy/bar.json`, and use
`haoshoku --omarchy-bar-backup` to capture the live bar back into the repo.
The same commands deploy and back up Haoshoku's bundled `xzat.tray` plugin at
`~/.config/omarchy/plugins/xzat.tray`. Its overflow drawer combines status
notifier items with Galaxy Buds, hyprmoncfg, Display, and No Sleep controls.
The full Arch setup restores the plugin and layout automatically; no separate
clone step is needed. Feishin and Omarchy's generic MPRIS widget remain in the
left section, while Agent Usage Plus stays visible on the right.
Haoshoku claims the `bar` key of `~/.config/omarchy/shell.json` wholesale,
including bar-widget enablement. Disabling a bar widget through Omarchy's UI is
therefore reverted on the next deploy. Every other top-level key — including
`idle`, `plugins`, `disabledPlugins`, `version`, and unknown keys — is preserved.

## Agent and orchestration policy

Haoshoku deploys the compact Claude/Codex instructions, installs the Matt
Pocock and upstream Paseo skill sources through the Skills CLI, and syncs only
its four owned workflow skills: `model-routing`, `paseo-pr-babysit`,
`paseo-pr-review`, and `html-deliverables`. Back up live edits with:

```bash
haoshoku --claude-backup
haoshoku --codex-backup
haoshoku --agent-skills-backup
haoshoku --paseo-profiles-backup
```

`--paseo-profiles` merges the bundled profile IDs and whitelisted provider
fields into `~/.paseo/config.json`, preserving unknown profiles, credentials,
relay/listen/auth settings, and every unrelated key. Its backup writes only
profile fields plus provider `extends`, `label`, `description`, `command`, and
`enabled`; it never copies credentials, daemon identity, relay state, or
runtime files. Claude/Codex runtime state and `settings.json` remain
machine-local.

Ordinary documentation uses `docs-glm`, PR requirements review uses
`pr-requirements-glm`, and cheap PR monitoring uses `pr-monitor-glm`. These
profiles run GLM 5.3 Flash through OpenCode Go. During an upgrade, Haoshoku
removes each corresponding retired managed Muse profile (`docs-muse`,
`pr-requirements-muse`, or `pr-monitor-muse`) only when its GLM replacement is
present in the bundled policy; custom profile IDs remain untouched.

## Claude Remote Control

The optional Claude Remote Control setup runs persistent Claude sessions from
three fixed roots: `haki` at `$HOME`, `dev` at `$HOME/dev`, and `work` at
`$HOME/Work`. Instances whose roots do not exist are skipped with a warning.
On Omarchy, `haoshoku-special-workspace haki` opens the tagged Kitty `haki`
session on its special workspace, with Claude above a fresh Codex pane below;
it has no default keybinding. KDE uses its own Warp `agents` route.
Set `claudeSessionName` in
`~/.haoshoku.json` only to resume a named Haki Claude session. A missing or null
value starts plain Claude; a
syntactically invalid value is preserved, reported, and ignored. A valid name is
passed as one literal argument to `claude -r`, but it resumes directly only when
the name resolves uniquely; otherwise Claude may open its picker. This
Haki launcher never attaches to tmux
or calls systemd.

These sessions run Claude Remote Control in **server mode**
(`claude remote-control --spawn same-dir --capacity 5`): each is a persistent
host that spawns up to five on-demand sessions in its own directory, launched
with `--permission-mode bypassPermissions`. The Arch setup calls this out
before installation. The user services enable
systemd lingering when possible so sessions can survive logout; if lingering
cannot be enabled automatically, setup prints the exact `loginctl` command to
run.

Installation sets `bypassPermissionsModeAccepted: true` in `~/.claude.json`.
This machine-wide acceptance affects every Claude Code session, not only the
three managed services, and persists until manually reverted. To undo it, edit
`~/.claude.json` and remove `bypassPermissionsModeAccepted` or set it to
`false`.

Attach to any enabled managed session from a terminal with:

```bash
~/.local/bin/haoshoku-claude-remote-control attach haki
~/.local/bin/haoshoku-claude-remote-control attach dev
~/.local/bin/haoshoku-claude-remote-control attach work
```

Deploy or snapshot the supervisor and user unit independently with:

```bash
haoshoku --claude-remote-control
haoshoku --claude-remote-control-backup
```

## Gaming

Accepting the gaming prompt installs a portable Arch gaming base:

- Steam
- GameMode and its 32-bit library
- Gamescope
- MangoHud and its 32-bit library
- ProtonUp-RS

On Omarchy, Haoshoku also invokes Omarchy's GPU-aware helper for the correct
32-bit Vulkan/NVIDIA libraries. Other Arch distributions are not given guessed
GPU packages.

## Bash additions

The managed fragment exposes both package-installed Bun and a user installation
under `~/.bun/bin`, and provides guarded initialization for Starship, direnv,
zoxide, thefuck, pyenv, and Conda, plus the aliases formerly kept in the Fish
configuration. Machine-local secrets can be stored in
`~/.config/haoshoku/secrets.bash`; that file is never copied into this repo.

## One-shot configuration

```bash
haoshoku --claude
haoshoku --claude-backup
haoshoku --claude-remote-control
haoshoku --claude-remote-control-backup
haoshoku --claude-update
haoshoku --codex
haoshoku --codex-backup
haoshoku --server-t3-code
haoshoku --server-paseo
haoshoku --device-type laptop
haoshoku --kde-connect-commands
haoshoku --audio
haoshoku --audio-backup
haoshoku --mimeapps
haoshoku --mimeapps-backup
haoshoku --skills
haoshoku --skills-update
haoshoku --skills-list
haoshoku --agent-skills
haoshoku --agent-skills-backup
haoshoku --paseo-profiles
haoshoku --paseo-profiles-backup
haoshoku --gh-stack
haoshoku --claude-stay-awake
haoshoku --pr-watch
haoshoku --worktree-cleanup
haoshoku --workspaces
haoshoku --monitors
haoshoku --hyprmoncfg-backup
haoshoku --omarchy-plugins
haoshoku --omarchy-bar
haoshoku --omarchy-bar-backup
haoshoku --omarchy-appearance
haoshoku --3-4-migrate
```

Use `haoshoku --device-type pc` or `laptop` to override automatic detection.
Later full Arch-family setups honor that stored explicit value.

`haoshoku --3-4-migrate` is a re-runnable, idempotent migration from an
Omarchy 3 layout to Omarchy 4: it strips dead `source =` lines, removes
orphaned overlay `.conf` files, repoints theme paths, backs up and clears
Omarchy's stock `monitors.lua`, deploys the Lua overlay and hyprmoncfg
profiles, installs plugins, and validates — and if Omarchy's legacy config
shim is still present it reports validation deferred and asks for a reboot
and re-run instead of claiming success.

Run `haoshoku --help` for the complete current list.

## Debian Server

```bash
haoshoku --os debian-server
```

The Debian path remains deliberately headless. In addition to server hardening,
it installs the portable Claude/Codex policy, Matt Pocock and upstream Paseo
skills, Haoshoku-owned workflow skills, PR-watch, and the native Paseo daemon.
Paseo is required and its managed orchestration policy is synced after the
service is ready. T3 Code is an optional, default-No compatibility step.

When T3 Code is selected, Haoshoku ensures its current Node.js runtime range
before installing and verifying the upstream-managed service. It then inspects
T3 Connect's machine-readable status. An existing
provisioned link is left running without reauthorization or restart. Otherwise,
Haoshoku runs `npx --yes t3@latest connect link --headless` in the attached
terminal, allowing T3 to install and verify its managed relay client and guide
you through browser authorization. It updates and restarts `t3code.service`,
waits for the environment link and relay to become ready, and verifies the
service again. The service belongs to the account that runs Haoshoku, including
root when root ownership is intentional.

T3 remains bound to `127.0.0.1:3773`; Haoshoku does not create an Nginx virtual
host, change DNS, open that port, or add a firewall rule. After setup, open the
T3 Code phone app, choose T3 Connect, and sign in with the same account used
during authorization. The phone does not need Tailscale. Run
`haoshoku --server-t3-code` to install or repair only this complete server
component; normal Debian setup offers the same flow without removing existing
T3 installations or sessions when declined.

If the server previously used Haoshoku v8.5.3's Tailscale integration, inspect
`tailscale serve status` after confirming T3 Connect works. Only when it still
shows the old T3 HTTPS handler, remove that handler with
`tailscale serve --https=443 off`. `No serve config` means cleanup is already
complete; Haoshoku never changes existing Tailscale routes automatically.

The full Debian path asks about Git, Claude stay-awake, Claude Remote Control,
automatic worktree cleanup, and optional T3 Code. `haoshoku --skills` refreshes
both declared external skill sources independently using Bun's `bunx` runner.

### Native headless Paseo

Run `haoshoku --server-paseo` directly as the account that should own Paseo.
Normal login users and direct root logins are supported; do not prefix a
non-root run with `sudo` unless root ownership is intentional. Haoshoku installs
`@getpaseo/cli` under `~/.local`, writes a new `~/.paseo/config.json` only when
none exists, and manages `paseo-daemon.service` as that account's systemd user
service. For root this means `/root/.local`, `/root/.paseo`, and the root user
manager at `/run/user/0/bus`. If that manager is unavailable, Haoshoku stops
with recovery guidance instead of targeting another user's session. A new config
listens on `127.0.0.1:6767`, enables the Paseo MCP endpoint, disables relay,
and keeps the bundled web UI off. An existing valid JSON object is left
byte-for-byte untouched, so its listen, authentication, relay, providers,
profiles, and unknown settings remain authoritative. Edit that file directly,
then use `paseo reload`; restart only when Paseo reports a restart-required
setting.

The unit runs `paseo daemon start --foreground --home ~/.paseo`, restarts only
after failure, and enables user lingering for startup after reboot and logout.
Haoshoku refuses to replace a foreign unit or take over an unmanaged/desktop
daemon. Useful lifecycle and recovery commands are:

```bash
systemctl --user status paseo-daemon.service
systemctl --user restart paseo-daemon.service
journalctl --user -u paseo-daemon.service -n 100
paseo daemon status --home ~/.paseo
```

In an attached terminal Haoshoku optionally runs
`paseo daemon pair --relay --home ~/.paseo`; otherwise it prints that command
for later. Pairing enables Paseo's end-to-end encrypted relay and creates a
phone offer. It does not authenticate an agent provider or prove that a phone
connected. For local-only access, keep relay disabled and connect through
Paseo's SSH transport; Haoshoku does not open a port or alter the firewall.

To operate a VPS from a PC agent without enabling a public Paseo port, first
configure and verify a normal SSH alias in `~/.ssh/config`, then pass that alias
after each Paseo subcommand (the installed 0.7.2 CLI does not accept a global
`--host` before the command):

```bash
ssh my-vps
paseo ls --host ssh://my-vps --json
paseo reload --host ssh://my-vps --json
```

The desktop app can keep the local PC and VPS available through the same app.
For phone access, run the pairing command on each desired host and accept its
encrypted relay offer in the app. SSH and relay are independent; neither flow
causes Haoshoku to expose port 6767.

This setup does not install or authenticate provider CLIs. Install and log in
to Claude Code, Codex, OpenCode, or another supported provider separately as
the same user, then verify the daemon's environment and available models:

```bash
paseo provider diagnostic codex
paseo provider models codex
```

The standalone `--server-paseo` flag remains lifecycle-only. Full Debian setup
follows it with `--paseo-profiles` behavior; use that one-shot flag explicitly
after editing the bundled policy. Browser tools require a connected Paseo
desktop app because the headless daemon brokers browser tabs but does not host
a browser itself.

Debian Server does not ask for `deviceType`: that value only selects desktop
audio and Hyprland/Omarchy variants. For the same reason the Debian path does
not deploy audio, browser/MIME integration, the desktop-oriented user-script
bundle, Brave managed policies, Hyprland monitors/workspaces, or Omazed. Those
steps remain on the Arch/Omarchy path instead of being installed onto a
headless server for superficial symmetry.

## Development

```bash
bun install
bun test
bun run lint
```
