import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { log, promptUser } from "../common/utils.js";

export const HERMES_RELAY_PLUGIN_FILES = [
	"__init__.py",
	"adapters.py",
	"cli.py",
	"outbound.py",
	"relay.py",
	"runtime.py",
	"storage.py",
	"hermes-relay",
	"config.example.json",
	"README.md",
	"plugin.yaml",
];

const PLUGIN_NAME = "paseo-review-relay";
const PLACEHOLDER_PREFIX = "YOUR_";
const HERMES_PROBE = String.raw`
import json
import os
import sys
from pathlib import Path

mode = sys.argv[1]
home = Path(sys.argv[2])

def private_env():
    values = {}
    try:
        for raw in (home / ".env").read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[7:].lstrip()
            key, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
                value = value[1:-1]
            values[key.strip()] = value
    except (OSError, UnicodeError):
        pass
    return values

def telegram_identity():
    import yaml
    data = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8")) or {}
    telegram = ((data.get("platforms") or {}).get("telegram") or {})
    channel = telegram.get("home_channel") or {}
    chat_id = channel.get("chat_id") if isinstance(channel, dict) else None
    env = private_env()
    chat_id = env.get("TELEGRAM_HOME_CHANNEL") or chat_id
    users = [item.strip() for item in env.get("TELEGRAM_ALLOWED_USERS", "").split(",") if item.strip()]
    if len(users) != 1 or str(chat_id or "").strip() != users[0]:
        return None
    return {"chatId": users[0], "userId": users[0]}

def gateway_activity():
    from gateway.control_socket import query_gateway_control
    status = query_gateway_control(home, "status")
    if not isinstance(status, dict) or status.get("gateway_state") != "running":
        return {"activity": "unknown"}
    try:
        active = max(0, int(status.get("active_agents", 0)))
    except (TypeError, ValueError):
        return {"activity": "unknown"}
    return {"activity": "busy" if active else "idle"}

try:
    result = telegram_identity() if mode == "telegram-identity" else gateway_activity()
except Exception:
    result = None if mode == "telegram-identity" else {"activity": "unknown"}
print(json.dumps(result, separators=(",", ":")))
`;

async function defaultRunProcess(argv, options = {}) {
	const process = Bun.spawn(argv, {
		cwd: options.cwd,
		env: options.env,
		stderr: options.stdio === "inherit" ? "inherit" : "pipe",
		stdin: options.stdio === "inherit" ? "inherit" : "ignore",
		stdout: options.stdio === "inherit" ? "inherit" : "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		process.exited,
		process.stdout ? new Response(process.stdout).text() : "",
		process.stderr ? new Response(process.stderr).text() : "",
	]);
	return { exitCode, stdout, stderr };
}

function executableAt(candidate, fsImpl) {
	if (!candidate) return null;
	try {
		const stat = fsImpl.statSync(candidate);
		return stat.isFile() && (stat.mode & 0o111) !== 0 ? candidate : null;
	} catch {
		return null;
	}
}

function findExecutable(command, candidates, whichImpl, fsImpl) {
	return (
		whichImpl(command) ??
		candidates.map((item) => executableAt(item, fsImpl)).find(Boolean) ??
		null
	);
}

function findHermesPython(hermesHome, fsImpl) {
	return [
		"/usr/local/lib/hermes-agent/venv/bin/python",
		path.join(hermesHome, "hermes-agent", "venv", "bin", "python"),
	]
		.map((candidate) => executableAt(candidate, fsImpl))
		.find(Boolean);
}

async function runHermesProbe({
	mode,
	hermesHome,
	fsImpl,
	environment,
	runProcessImpl,
}) {
	const python = findHermesPython(hermesHome, fsImpl);
	if (!python) return null;
	const result = await runProcessImpl(
		[python, "-c", HERMES_PROBE, mode, hermesHome],
		{ env: { ...environment, HERMES_HOME: hermesHome } },
	);
	if (result.exitCode !== 0) return null;
	try {
		return JSON.parse(result.stdout);
	} catch {
		return null;
	}
}

function readJsonObject(file, fsImpl, logger) {
	try {
		const value = JSON.parse(fsImpl.readFileSync(file, "utf8"));
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new TypeError("root must be a JSON object");
		}
		return value;
	} catch (error) {
		logger.error(`Invalid ${file}; leaving it untouched (${error.message}).`);
		return null;
	}
}

function validManifest(source, fsImpl, logger, expectedVersion = null) {
	const manifest = path.join(source, "plugin.yaml");
	try {
		const content = fsImpl.readFileSync(manifest, "utf8");
		if (!/^name:\s*paseo-review-relay\s*$/m.test(content)) {
			logger.error(
				`Refusing relay source without name: ${PLUGIN_NAME} in ${manifest}.`,
			);
			return false;
		}
		if (
			expectedVersion &&
			!new RegExp(
				`^version:\\s*${expectedVersion.replaceAll(".", "\\.")}\\s*$`,
				"m",
			).test(content)
		) {
			logger.error(
				`Relay manifest version does not match locked tag v${expectedVersion}.`,
			);
			return false;
		}
		for (const file of HERMES_RELAY_PLUGIN_FILES) {
			if (!fsImpl.statSync(path.join(source, file)).isFile()) {
				throw new Error(`missing ${file}`);
			}
		}
		return true;
	} catch (error) {
		logger.error(`Invalid Hermes relay source ${source} (${error.message}).`);
		return false;
	}
}

function readSourceLock(projectRoot, fsImpl, logger) {
	const lockPath = path.join(
		projectRoot,
		"configs",
		"hermes-relay",
		"lock.json",
	);
	const lock = readJsonObject(lockPath, fsImpl, logger);
	if (!lock) return null;
	if (
		lock.version !== 1 ||
		lock.repository !==
			"https://github.com/axatbhardwaj/paseo-hermes-relay.git" ||
		!/^v\d+\.\d+\.\d+$/.test(lock.tag) ||
		!(lock.commit === null || /^[0-9a-f]{40}$/.test(lock.commit)) ||
		typeof lock.vendoredFallback !== "string"
	) {
		logger.error(`Invalid Hermes relay source lock ${lockPath}.`);
		return null;
	}
	return { ...lock, lockPath };
}

function readHermesRuntimeLock(projectRoot, fsImpl, logger) {
	const lockPath = path.join(
		projectRoot,
		"configs",
		"hermes-relay",
		"hermes-runtime.json",
	);
	const lock = readJsonObject(lockPath, fsImpl, logger);
	if (
		!lock ||
		lock.version !== 1 ||
		lock.installer !== "https://hermes-agent.nousresearch.com/install.sh" ||
		!/^([0-9a-f]{40})$/.test(lock.commit)
	) {
		logger.error(`Invalid Hermes runtime lock ${lockPath}.`);
		return null;
	}
	return lock;
}

async function bootstrapHermes({
	projectRoot,
	hermesHome,
	fsImpl,
	whichImpl,
	runProcessImpl,
	environment,
	logger,
}) {
	const lock = readHermesRuntimeLock(projectRoot, fsImpl, logger);
	if (!lock) return false;
	const curl = findExecutable("curl", ["/usr/bin/curl"], whichImpl, fsImpl);
	const bash = findExecutable("bash", ["/usr/bin/bash"], whichImpl, fsImpl);
	if (!curl || !bash) {
		logger.error(
			"Hermes bootstrap requires curl and bash; configuration is incomplete.",
		);
		return false;
	}
	const cache = path.join(hermesHome, ".cache", "haoshoku");
	fsImpl.mkdirSync(cache, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(cache, 0o700);
	const temporary = fsImpl.mkdtempSync(path.join(cache, "hermes-install-"));
	const installer = path.join(temporary, "install.sh");
	try {
		const fetched = await runProcessImpl(
			[curl, "-fsSL", lock.installer, "-o", installer],
			{ env: environment },
		);
		if (fetched.exitCode !== 0) {
			logger.error(
				"Pinned Hermes bootstrap failed while fetching the installer.",
			);
			return false;
		}
		const installed = await runProcessImpl(
			[
				bash,
				installer,
				"--commit",
				lock.commit,
				"--skip-setup",
				"--skip-browser",
				"--skip-computer-use",
				"--non-interactive",
			],
			{ env: environment, stdio: "inherit" },
		);
		if (installed.exitCode !== 0) {
			logger.error(
				"Pinned Hermes bootstrap failed; configuration is incomplete.",
			);
			return false;
		}
		return true;
	} finally {
		fsImpl.rmSync(temporary, { recursive: true, force: true });
	}
}

async function verifyPinnedSource({
	directory,
	lock,
	git,
	environment,
	runProcessImpl,
	fsImpl,
	logger,
}) {
	for (const [label, argv] of [
		["commit", [git, "-C", directory, "rev-parse", "HEAD"]],
		["tag", [git, "-C", directory, "rev-parse", `${lock.tag}^{commit}`]],
	]) {
		const result = await runProcessImpl(argv, { env: environment });
		const actual = result.stdout.trim().toLowerCase();
		if (result.exitCode !== 0 || actual !== lock.commit) {
			logger.error(
				`Hermes relay ${label} mismatch: expected ${lock.commit}, got ${actual || "unavailable"}.`,
			);
			return false;
		}
	}
	return validManifest(directory, fsImpl, logger, lock.tag.slice(1));
}

async function resolvePluginSource({
	projectRoot,
	hermesHome,
	sourceDirectory,
	fsImpl,
	whichImpl,
	runProcessImpl,
	environment,
	logger,
}) {
	const lock = readSourceLock(projectRoot, fsImpl, logger);
	if (!lock) return null;
	if (lock.commit === null) {
		if (sourceDirectory) {
			logger.error(
				`The source-directory override requires a finalized commit in ${lock.lockPath}.`,
			);
			return null;
		}
		const source = path.resolve(
			path.dirname(lock.lockPath),
			lock.vendoredFallback,
		);
		const projectPrefix = `${path.resolve(projectRoot)}${path.sep}`;
		if (!source.startsWith(projectPrefix)) {
			logger.error(
				"The vendored Hermes relay fallback must stay inside this repository.",
			);
			return null;
		}
		return validManifest(source, fsImpl, logger)
			? { directory: source, cleanup: null }
			: null;
	}

	const git = findExecutable("git", ["/usr/bin/git"], whichImpl, fsImpl);
	if (!git) {
		logger.error(
			"Git is unavailable; cannot verify the pinned Hermes relay source.",
		);
		return null;
	}
	let directory = sourceDirectory ? path.resolve(sourceDirectory) : null;
	let cleanup = null;
	if (!directory) {
		const cache = path.join(hermesHome, ".cache", "haoshoku");
		fsImpl.mkdirSync(cache, { recursive: true, mode: 0o700 });
		fsImpl.chmodSync(cache, 0o700);
		directory = fsImpl.mkdtempSync(path.join(cache, "relay-source-"));
		cleanup = directory;
		const clone = await runProcessImpl(
			[git, "clone", "--no-checkout", lock.repository, directory],
			{ env: environment },
		);
		if (clone.exitCode !== 0) {
			logger.error(
				`Could not fetch the pinned relay source. Retry: git clone --no-checkout ${lock.repository} <temporary-directory>`,
			);
			return { directory: null, cleanup };
		}
		const checkout = await runProcessImpl(
			[git, "-C", directory, "checkout", "--detach", lock.commit],
			{ env: environment },
		);
		if (checkout.exitCode !== 0) {
			logger.error(
				`Could not check out pinned Hermes relay commit ${lock.commit}.`,
			);
			return { directory: null, cleanup };
		}
	}
	if (
		!(await verifyPinnedSource({
			directory,
			lock,
			git,
			environment,
			runProcessImpl,
			fsImpl,
			logger,
		}))
	) {
		return { directory: null, cleanup };
	}
	return { directory, cleanup };
}

function sameBytes(left, right, fsImpl) {
	try {
		return fsImpl.readFileSync(left).equals(fsImpl.readFileSync(right));
	} catch {
		return false;
	}
}

function backupTimestamp(now) {
	return now
		.toISOString()
		.replaceAll("-", "")
		.replaceAll(":", "")
		.replace(/\.\d{3}Z$/, "Z");
}

function deployPlugin({ source, target, backupRoot, fsImpl, nowImpl, logger }) {
	const targetExists = fsImpl.existsSync(target);
	const byteChanged = HERMES_RELAY_PLUGIN_FILES.some(
		(file) =>
			!sameBytes(path.join(source, file), path.join(target, file), fsImpl),
	);
	if (targetExists && byteChanged) {
		fsImpl.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
		fsImpl.chmodSync(backupRoot, 0o700);
		const stem = path.join(
			backupRoot,
			`${PLUGIN_NAME}-${backupTimestamp(nowImpl())}`,
		);
		let backup = stem;
		for (let suffix = 1; fsImpl.existsSync(backup); suffix += 1) {
			backup = `${stem}.${suffix}`;
		}
		fsImpl.cpSync(target, backup, { recursive: true, errorOnExist: true });
		logger.info(`Backed up the existing Hermes relay plugin to ${backup}.`);
	}
	let changed = byteChanged;
	fsImpl.mkdirSync(target, { recursive: true, mode: 0o700 });
	if ((fsImpl.statSync(target).mode & 0o777) !== 0o700) changed = true;
	fsImpl.chmodSync(target, 0o700);
	for (const file of HERMES_RELAY_PLUGIN_FILES) {
		const from = path.join(source, file);
		const to = path.join(target, file);
		if (!sameBytes(from, to, fsImpl)) {
			fsImpl.copyFileSync(from, to);
		}
		const mode = file === "hermes-relay" ? 0o755 : 0o600;
		if ((fsImpl.statSync(to).mode & 0o777) !== mode) changed = true;
		fsImpl.chmodSync(to, mode);
	}
	return changed;
}

function ensureCliLink(home, pluginDirectory, fsImpl, logger) {
	const binDirectory = path.join(home, ".local", "bin");
	const link = path.join(binDirectory, "hermes-relay");
	const target = path.join(pluginDirectory, "hermes-relay");
	fsImpl.mkdirSync(binDirectory, { recursive: true, mode: 0o700 });
	try {
		const stat = fsImpl.lstatSync(link);
		if (!stat.isSymbolicLink()) {
			logger.error(`Refusing to replace non-symlink ${link}.`);
			return null;
		}
		if (
			path.resolve(path.dirname(link), fsImpl.readlinkSync(link)) !== target
		) {
			logger.error(
				`Refusing to replace ${link}; it points outside the managed relay.`,
			);
			return null;
		}
		return false;
	} catch (error) {
		if (error?.code !== "ENOENT") {
			logger.error(`Could not inspect ${link} (${error.message}).`);
			return null;
		}
	}
	fsImpl.symlinkSync(target, link);
	return true;
}

function isPrivateId(value, { allowNegative = false } = {}) {
	const pattern = allowNegative ? /^-?\d+$/ : /^\d+$/;
	return pattern.test(String(value ?? "").trim());
}

function validServerId(value) {
	const normalized = String(value ?? "").trim();
	return normalized.length > 0 && !normalized.startsWith(PLACEHOLDER_PREFIX);
}

async function readPaseoIdentity({
	home,
	fsImpl,
	environment,
	runProcessImpl,
	whichImpl,
	logger,
}) {
	const paseo = findExecutable(
		"paseo",
		[path.join(home, ".local", "bin", "paseo"), "/usr/bin/paseo"],
		whichImpl,
		fsImpl,
	);
	if (!paseo) {
		logger.error(
			"Paseo CLI is unavailable; cannot verify the local server identity.",
		);
		return null;
	}
	const env = { ...environment };
	delete env.PASEO_HOST;
	delete env.PASEO_LISTEN;
	const result = await runProcessImpl([paseo, "status", "--json"], { env });
	if (result.exitCode !== 0) {
		logger.error(
			"Could not read the local Paseo status; relay configuration is incomplete.",
		);
		return null;
	}
	try {
		const status = JSON.parse(result.stdout);
		if (
			!validServerId(status.serverId) ||
			status.localDaemon !== "running" ||
			status.connectedDaemon !== "reachable"
		) {
			throw new Error("local daemon is not running and reachable");
		}
		return status.serverId.trim();
	} catch (error) {
		logger.error(`Local Paseo identity is not usable (${error.message}).`);
		return null;
	}
}

function writePrivateConfig(file, value, writeContent, fsImpl) {
	let changed = writeContent;
	if (writeContent) {
		fsImpl.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
			mode: 0o600,
		});
	}
	try {
		if ((fsImpl.statSync(file).mode & 0o777) !== 0o600) changed = true;
	} catch {}
	fsImpl.chmodSync(file, 0o600);
	return changed;
}

async function enablePluginIfNeeded({
	hermes,
	environment,
	runProcessImpl,
	logger,
}) {
	const list = await runProcessImpl(
		[hermes, "plugins", "list", "--enabled", "--user", "--json"],
		{ env: environment },
	);
	if (list.exitCode !== 0) {
		logger.error(
			"Could not inspect enabled Hermes plugins; configuration is incomplete.",
		);
		return null;
	}
	let enabled;
	try {
		const entries = JSON.parse(list.stdout);
		enabled = Array.isArray(entries)
			? entries.some(
					(entry) => entry?.name === PLUGIN_NAME && entry?.status === "enabled",
				)
			: false;
	} catch (error) {
		logger.error(
			`Hermes plugin inventory was not valid JSON (${error.message}).`,
		);
		return null;
	}
	if (enabled) return false;
	const result = await runProcessImpl(
		[hermes, "plugins", "enable", PLUGIN_NAME, "--no-allow-tool-override"],
		{ env: environment, stdio: "inherit" },
	);
	if (result.exitCode !== 0) {
		logger.error(
			`Hermes could not enable ${PLUGIN_NAME} without tool-override permission.`,
		);
		return null;
	}
	return true;
}

async function validatePlugin({
	hermes,
	pluginDirectory,
	cliLink,
	environment,
	runProcessImpl,
	logger,
}) {
	for (const argv of [
		[hermes, "plugins", "doctor", pluginDirectory, "--ci"],
		[cliLink, "doctor"],
	]) {
		const result = await runProcessImpl(argv, { env: environment });
		if (result.exitCode !== 0) {
			logger.error(
				`Relay validation failed: ${argv.join(" ")}. Hermes ${String(result.stderr || result.stdout || "returned no diagnostic").trim()}`,
			);
			return false;
		}
	}
	return true;
}

function writeEnableMarker(home, fsImpl) {
	const directory = path.join(home, ".config", "haoshoku");
	const marker = path.join(directory, "hermes-relay.json");
	fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(directory, 0o700);
	fsImpl.writeFileSync(marker, '{\n  "version": 1,\n  "enabled": true\n}\n', {
		mode: 0o600,
	});
	fsImpl.chmodSync(marker, 0o600);
}

export async function configureHermesRelay({
	home = homedir(),
	projectRoot = path.resolve(import.meta.dir, "..", ".."),
	fsImpl = fs,
	runProcessImpl = defaultRunProcess,
	environment = process.env,
	isTTY = Boolean(process.stdin.isTTY),
	promptImpl = promptUser,
	logger = log,
	whichImpl = (command) => Bun.which(command),
	readTelegramIdentityImpl = null,
	gatewayActivityImpl = null,
	nowImpl = () => new Date(),
	sourceDirectory = environment.HAOSHOKU_HERMES_RELAY_SOURCE,
	hermesCandidates = [
		path.join(home, ".local", "bin", "hermes"),
		"/usr/local/bin/hermes",
	],
} = {}) {
	const hermesHome = environment.HERMES_HOME || path.join(home, ".hermes");
	const readTelegramIdentity =
		readTelegramIdentityImpl ??
		(async () =>
			runHermesProbe({
				mode: "telegram-identity",
				hermesHome,
				fsImpl,
				environment,
				runProcessImpl,
			}));
	const readGatewayActivity =
		gatewayActivityImpl ??
		(async () => {
			const result = await runHermesProbe({
				mode: "gateway-activity",
				hermesHome,
				fsImpl,
				environment,
				runProcessImpl,
			});
			return ["idle", "busy"].includes(result?.activity)
				? result.activity
				: "unknown";
		});
	let hermes = findExecutable("hermes", hermesCandidates, whichImpl, fsImpl);
	if (!hermes) {
		if (
			!(await bootstrapHermes({
				projectRoot,
				hermesHome,
				fsImpl,
				whichImpl,
				runProcessImpl,
				environment,
				logger,
			}))
		) {
			return false;
		}
		hermes = findExecutable("hermes", hermesCandidates, whichImpl, fsImpl);
		if (!hermes) {
			logger.error(
				"Hermes installer completed, but its CLI is unavailable; configuration is incomplete.",
			);
			return false;
		}
	}
	const version = await runProcessImpl([hermes, "--version"], {
		env: environment,
	});
	if (version.exitCode !== 0) {
		logger.error(
			"The existing Hermes CLI is not usable; it was not upgraded or replaced.",
		);
		return false;
	}
	if (!fsImpl.existsSync(path.join(hermesHome, "config.yaml"))) {
		logger.error(
			`Hermes setup is incomplete: create ${path.join(hermesHome, "config.yaml")} and retry.`,
		);
		return false;
	}

	const resolvedSource = await resolvePluginSource({
		projectRoot,
		hermesHome,
		sourceDirectory,
		fsImpl,
		whichImpl,
		runProcessImpl,
		environment,
		logger,
	});
	if (!resolvedSource) return false;
	const source = resolvedSource.directory;
	if (!source) {
		if (resolvedSource.cleanup) {
			fsImpl.rmSync(resolvedSource.cleanup, { recursive: true, force: true });
		}
		return false;
	}
	const pluginDirectory = path.join(hermesHome, "plugins", PLUGIN_NAME);
	let pluginChanged;
	try {
		if (
			fsImpl.existsSync(pluginDirectory) &&
			!validManifest(pluginDirectory, fsImpl, logger)
		) {
			logger.error(
				`Refusing to overwrite foreign plugin directory ${pluginDirectory}.`,
			);
			return false;
		}
		pluginChanged = deployPlugin({
			source,
			target: pluginDirectory,
			backupRoot: path.join(hermesHome, "backups", "haoshoku"),
			fsImpl,
			nowImpl,
			logger,
		});
	} finally {
		if (resolvedSource.cleanup) {
			fsImpl.rmSync(resolvedSource.cleanup, { recursive: true, force: true });
		}
	}
	const linkChanged = ensureCliLink(home, pluginDirectory, fsImpl, logger);
	if (linkChanged === null) return false;

	const dataDirectory = path.join(hermesHome, "plugin-data", PLUGIN_NAME);
	const configPath = path.join(dataDirectory, "config.json");
	fsImpl.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(dataDirectory, 0o700);
	const configExists = fsImpl.existsSync(configPath);
	const config = configExists
		? readJsonObject(configPath, fsImpl, logger)
		: readJsonObject(path.join(source, "config.example.json"), fsImpl, logger);
	if (!config) return false;
	const originalConfig = structuredClone(config);

	const serverId = await readPaseoIdentity({
		home,
		fsImpl,
		environment,
		runProcessImpl,
		whichImpl,
		logger,
	});
	if (!serverId) return false;
	if (validServerId(config.serverId) && config.serverId !== serverId) {
		logger.error(
			`Configured serverId does not match the local Paseo server; leaving ${configPath} untouched.`,
		);
		return false;
	}
	config.serverId = serverId;
	if (
		!isPrivateId(config.telegramChatId, { allowNegative: true }) ||
		!isPrivateId(config.telegramUserId)
	) {
		const telegram = await readTelegramIdentity({
			hermesHome,
			environment,
		});
		if (telegram) {
			config.telegramChatId = telegram.chatId;
			config.telegramUserId = telegram.userId;
		}
	}
	const configChanged = writePrivateConfig(
		configPath,
		config,
		!configExists || JSON.stringify(config) !== JSON.stringify(originalConfig),
		fsImpl,
	);

	if (
		!isPrivateId(config.telegramChatId, { allowNegative: true }) ||
		!isPrivateId(config.telegramUserId)
	) {
		logger.error(
			`Hermes relay configuration is incomplete. Set telegramChatId and telegramUserId in ${configPath}, then retry: haoshoku --server-hermes-relay`,
		);
		return false;
	}

	const enableChanged = await enablePluginIfNeeded({
		hermes,
		environment,
		runProcessImpl,
		logger,
	});
	if (enableChanged === null) return false;
	const cliLink = path.join(home, ".local", "bin", "hermes-relay");
	if (
		!(await validatePlugin({
			hermes,
			pluginDirectory,
			cliLink,
			environment,
			runProcessImpl,
			logger,
		}))
	) {
		return false;
	}

	const activationChanged =
		pluginChanged || linkChanged || configChanged || enableChanged;
	if (activationChanged) {
		const activity = await readGatewayActivity({ hermesHome, environment });
		if (activity === "busy") {
			logger.warning(
				"Hermes relay is configured, but activation is deferred to protect active Hermes work. Retry after the gateway is idle.",
			);
			return false;
		}
		if (activity !== "idle") {
			logger.warning(
				"Hermes relay is configured, but activation is deferred because Haoshoku could not confirm that the gateway is idle. Check gateway status and retry.",
			);
			return false;
		}
		if (!isTTY) {
			logger.warning(
				"Hermes relay is configured but activation is pending. From an interactive idle VPS shell, run: haoshoku --server-hermes-relay",
			);
			return false;
		}
		if (
			!(await promptImpl(
				"Restart the idle Hermes gateway to activate the relay?",
				true,
			))
		) {
			logger.warning(
				"Hermes relay is configured, but gateway activation was declined.",
			);
			return false;
		}
		const restarted = await runProcessImpl([hermes, "gateway", "restart"], {
			env: environment,
			stdio: "inherit",
		});
		if (restarted.exitCode !== 0) {
			logger.error(
				"Hermes relay is configured, but the idle gateway restart failed.",
			);
			return false;
		}
	}

	writeEnableMarker(home, fsImpl);
	logger.success(
		activationChanged
			? "Hermes relay is configured and active on this host."
			: "Hermes relay is already configured and active on this host.",
	);
	return true;
}
