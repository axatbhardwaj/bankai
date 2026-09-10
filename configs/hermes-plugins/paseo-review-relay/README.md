# Paseo review relay for Hermes

This user plugin maps a reply to a specific Telegram alert back to the exact
persistent Paseo PR owner and revision that created it. It is transport only:
it never approves, merges, chooses another owner, or expands prior authority.

## Safety model

- Only `pre_gateway_dispatch` is registered. The inline hook checks the Telegram
  DM chat, sender, reply anchor and message shape, persists one receipt, and then
  gives async work to `ctx.spawn_task`.
- Owner text is written to a mode-0600 UTF-8 prompt file. All `paseo`, `gh` and
  `hermes` calls use argument arrays without a shell.
- Paseo commands preserve the local home environment but remove `PASEO_HOST`, so
  status, owner inspection and delivery cannot be redirected to another daemon.
- Exact whole-message `approve`, `reject` and `hold` are decision receipts. A
  current GitHub head/base check only gates forwarding; the relay keeps the
  decision `open`, and the driver must revalidate before acting.
- Every other eligible text reply is a question. Forwarded, edited, bot,
  attachment and missing raw Telegram messages cannot enter the relay.
- Interrupted or ambiguous sends become `uncertain` and are never replayed.
  Only definite `failed` outbound attempts can be retried explicitly.
- Demo alerts hide real PR identity and reject all three decision words.
- If state lookup or receipt admission fails for a potential configured-DM reply,
  the hook consumes it and gives only the configured owner a generic temporary-
  unavailability acknowledgement. It never claims the reply was forwarded;
  unrelated platforms, chats, non-replies and unknown anchors remain untouched.

State is a private WAL SQLite database at
`~/.hermes/plugin-data/paseo-review-relay/relay.sqlite3`. Decision identity,
owner, server, repository/PR, head/base and proposal digest are immutable.
Mutable decision statuses are transport-only: `open`, `superseded`, `closed`,
`blocked`, and `uncertain`. Inbound forwarding status is recorded separately.

## Private configuration

Copy `config.example.json` to
`~/.hermes/plugin-data/paseo-review-relay/config.json`, replace every placeholder,
and set mode 0600. Never commit the populated file. Missing, unreadable, malformed,
incomplete, group-readable or placeholder configuration registers an inert hook;
`hermes-relay doctor` rejects it instead of enabling relay authority.

## Request file

`open` and `supersede` read a UTF-8 JSON file. Real requests require 40-character
hexadecimal head and base object IDs:

```json
{
  "decision_id": "pr-42-auth-policy-v1",
  "owner_agent_id": "PERSISTENT_PASEO_AGENT_ID",
  "server_id": "LOCAL_PASEO_SERVER_ID",
  "repository": "owner/repository",
  "pr_number": 42,
  "head_sha": "40_HEX_CHARACTERS",
  "base_sha": "40_HEX_CHARACTERS",
  "proposal": "What would change",
  "consequence": "What accepting it means",
  "recommendation": "approve, reject, hold, or a short recommendation",
  "question": "The decision being requested"
}
```

Set `"demo": true` only for a synthetic routing check. The relay replaces its
repository, PR and revisions with non-real sentinels before persistence or send.

## Operator CLI

After installation, link `hermes-relay` into a private operator PATH and use:

```bash
hermes-relay doctor
hermes-relay open --request-file /private/path/request.json
hermes-relay answer DECISION_ID --file /private/path/answer.txt
hermes-relay supersede OLD_DECISION_ID --request-file /private/path/revision.json
hermes-relay pending
hermes-relay close DECISION_ID
hermes-relay retry FAILED_ATTEMPT_ID
```

`pending` must be checked on later driver runs. `retry` refuses `pending`, `sent`
and `uncertain` attempts. A successful send means the platform returned a message
ID; it does not prove the user read it.

`answer`, `supersede`, and `retry` require an `open` decision. For a `blocked` or
`uncertain` decision, first inspect `pending` and reconcile the actual Telegram,
Paseo, and GitHub evidence. Never replay an uncertain attempt or choose a new
owner. If transport should continue, close the old decision and create a fresh
request with a new decision ID, verified persistent owner, and current revisions.

## Driver-owned install and validation

Do not install from an unreviewed or moving checkout. Pin the candidate commit,
back up any existing plugin directory, plugin-data config/database, and Hermes
config before copying. Install only this plugin and its private config, then add
`paseo-review-relay` to the existing `plugins.enabled` list without replacing
other entries. Do not copy repository skill trees over installed skills.

After independent review, the driver can adapt this narrow install sequence from
the pinned checkout. Replace the two placeholders before running it:

```bash
candidate_root=/absolute/path/to/pinned/candidate
backup_root=/root/.hermes/backups/paseo-review-relay-BEFORE_INSTALL_TIMESTAMP
plugin_source="$candidate_root/configs/hermes-plugins/paseo-review-relay"
plugin_target=/root/.hermes/plugins/paseo-review-relay

install -d -m 700 "$backup_root" /root/.hermes/plugins /root/.local/bin
if test -e "$plugin_target"; then cp -a -- "$plugin_target" "$backup_root/plugin"; fi
if test -e /root/.local/bin/hermes-relay; then
  cp -a -- /root/.local/bin/hermes-relay "$backup_root/hermes-relay"
fi
cp -a -- /root/.hermes/config.yaml "$backup_root/config.yaml"
install -d -m 700 "$plugin_target"
cp -a -- "$plugin_source/." "$plugin_target/"
install -m 755 "$plugin_source/hermes-relay" /root/.local/bin/hermes-relay
install -d -m 700 /root/.hermes/plugin-data/paseo-review-relay
if ! test -e /root/.hermes/plugin-data/paseo-review-relay/config.json; then
  install -m 600 "$plugin_source/config.example.json" \
    /root/.hermes/plugin-data/paseo-review-relay/config.json
fi
```

Populate the private config without printing it, then merge the plugin name into
the existing Hermes configuration. The installed operator guide is
`/root/.hermes/plugins/paseo-review-relay/README.md`; scheduled owners use
`/root/.local/bin/hermes-relay` explicitly rather than assuming bot automation.

Before activation, inspect persistent Paseo work and the Hermes gateway. Paseo
does not need restarting. If Hermes 0.21.1 requires a gateway restart to discover
the plugin, restart only after confirming it will not interrupt active work.

Run from the pinned candidate:

```bash
python3 -m unittest discover -s tests/hermes_review_relay -v
hermes-relay doctor
hermes plugins doctor /root/.hermes/plugins/paseo-review-relay --ci
```

The packaged doctor intentionally validates registration in a temporary empty
Hermes home. With no private config, the plugin registers one inert hook that
cannot admit or route messages. `hermes-relay doctor` separately checks the live
private config and database. A gateway process must register the plugin with the
valid private config before the relay is active.

Then run the synthetic registered-hook test in an isolated temporary Hermes home,
verify ordinary bot messages still dispatch normally, and send one clearly labeled
demo. A real phone reply is the final end-to-end proof; do not fabricate it.

For rollback, disable only `paseo-review-relay`, restore the exact backups, and
restart only the Hermes gateway if discovery requires it. Preserve the database
for audit unless the owner explicitly authorizes its removal.
