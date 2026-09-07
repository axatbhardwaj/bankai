import fs from "node:fs";
import { homedir, userInfo } from "node:os";
import path from "node:path";

import { ensureNode24Runtime } from "../common/node_24_runtime.js";
import { log, promptUser } from "../common/utils.js";

const PASEO_PACKAGE = "@getpaseo/cli";
const MINIMUM_PASEO_VERSION = [0, 7, 2];
const UNIT = "paseo-daemon.service";
const DEFAULT_LISTEN = "127.0.0.1:6767";
const READY_ATTEMPTS = 15;
const READY_INTERVAL_MS = 1000;
const CONTACTABLE_DAEMON_STATES = new Set([
	"reachable",
	"auth_required",
	"auth_failed",
]);

function cleanEnvironment(environment) {
	const clean = { ...environment };
	for (const variable of [
		"PASEO_HOME",
		"PASEO_HOST",
		"PASEO_LISTEN",
		"PASEO_RELAY_ENABLED",
		"PASEO_WEB_UI_ENABLED",
	]) {
		delete clean[variable];
	}
	return clean;
}

async function runProcess(args, { env, stdio = "pipe" } = {}) {
	try {
		const child = Bun.spawn(args, {
			env,
			stdin: stdio === "inherit" ? "inherit" : "ignore",
			stdout: stdio === "inherit" ? "inherit" : "pipe",
			stderr: stdio === "inherit" ? "inherit" : "pipe",
		});
		if (stdio === "inherit") {
			return { exitCode: await child.exited, stdout: "", stderr: "" };
		}
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	} catch (error) {
		return {
			exitCode: 127,
			stdout: "",
			stderr: error?.message ?? String(error),
		};
	}
}

function parseVersion(value) {
	const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
	return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, minimum) {
	if (!actual) return false;
	for (let index = 0; index < minimum.length; index += 1) {
		if (actual[index] > minimum[index]) return true;
		if (actual[index] < minimum[index]) return false;
	}
	return true;
}

async function nodeRuntime(runner, env) {
	const version = await runner(["node", "--version"], { env });
	if (
		version.exitCode !== 0 ||
		!versionAtLeast(parseVersion(version.stdout), [24])
	)
		return null;
	const executable = await runner(["node", "-p", "process.execPath"], { env });
	if (executable.exitCode !== 0 || !path.isAbsolute(executable.stdout.trim()))
		return null;
	return { path: executable.stdout.trim(), version: version.stdout.trim() };
}

async function ensureNodeRuntime(runner, env, logger) {
	return ensureNode24Runtime({
		readRuntimeImpl: () => nodeRuntime(runner, env),
		isRuntimeSupported: (runtime) => Boolean(runtime),
		runInstallStepImpl: async (step) =>
			(await runner(step.args, { env, stdio: "inherit" })).exitCode === 0,
		installMessage: "Installing the validated Node.js 24 LTS runtime...",
		incompatibleMessage: () =>
			"Node.js 24 is still unavailable after installation.",
		logger,
	});
}

async function paseoVersion(cli, runner, env) {
	const result = await runner([cli, "--version"], { env });
	return result.exitCode === 0 ? parseVersion(result.stdout) : null;
}

function isUserOwned(candidate, home, fsImpl) {
	try {
		const real = fsImpl.realpathSync(candidate);
		return real.startsWith(`${fsImpl.realpathSync(home)}${path.sep}`);
	} catch {
		return false;
	}
}

async function ensurePaseoCli({ home, fsImpl, runner, env, logger }) {
	const candidates = [
		path.join(home, ".local", "bin", "paseo"),
		path.join(home, ".bun", "bin", "paseo"),
	];
	for (const candidate of candidates) {
		if (
			isUserOwned(candidate, home, fsImpl) &&
			versionAtLeast(
				await paseoVersion(candidate, runner, env),
				MINIMUM_PASEO_VERSION,
			)
		) {
			logger.info(`Keeping the compatible user Paseo CLI at ${candidate}.`);
			return candidate;
		}
	}

	const npm = await runner(["npm", "--version"], { env });
	if (npm.exitCode !== 0) {
		logger.error("npm is unavailable after preparing Node.js 24.");
		return null;
	}
	const prefix = path.join(home, ".local");
	logger.info(`Installing ${PASEO_PACKAGE} into ${prefix}...`);
	const install = await runner(
		["npm", "--global", "--prefix", prefix, "install", PASEO_PACKAGE],
		{ env, stdio: "inherit" },
	);
	const cli = path.join(prefix, "bin", "paseo");
	if (
		install.exitCode !== 0 ||
		!isUserOwned(cli, home, fsImpl) ||
		!versionAtLeast(await paseoVersion(cli, runner, env), MINIMUM_PASEO_VERSION)
	) {
		logger.error(`Could not install a compatible ${PASEO_PACKAGE} user CLI.`);
		return null;
	}
	return cli;
}

function validateExistingConfig(configPath, fsImpl, logger) {
	if (!fsImpl.existsSync(configPath)) return { exists: false };
	try {
		const parsed = JSON.parse(fsImpl.readFileSync(configPath, "utf8"));
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new TypeError("root must be a JSON object");
		}
		return { exists: true };
	} catch (error) {
		logger.error(
			`Invalid ${configPath}; leaving it untouched (${error.message}). Fix it and retry.`,
		);
		return null;
	}
}

function createFreshConfig(configPath, fsImpl, logger) {
	const config = {
		$schema: "https://paseo.sh/schemas/paseo.config.v1.json",
		version: 1,
		daemon: {
			listen: DEFAULT_LISTEN,
			relay: { enabled: false },
			mcp: { enabled: true },
		},
		features: { webUi: { enabled: false } },
	};
	try {
		fsImpl.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
		fsImpl.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
			flag: "wx",
			mode: 0o600,
		});
		return true;
	} catch (error) {
		if (error?.code === "EEXIST") {
			return validateExistingConfig(configPath, fsImpl, logger)?.exists === true;
		}
		logger.error(`Could not create ${configPath} (${error.message}).`);
		return false;
	}
}

function defaultListenIsFree(readNetworkFileImpl) {
	try {
		const listeners = readNetworkFileImpl("/proc/net/tcp");
		for (const line of listeners.split("\n").slice(1)) {
			const fields = line.trim().split(/\s+/);
			const [address, port] = (fields[1] ?? "").split(":");
			if (
				port === "1A6F" &&
				fields[3] === "0A" &&
				(address === "0100007F" || address === "00000000")
			) {
				return false;
			}
		}
		return true;
	} catch {
		return null;
	}
}

function freshHomeIsSafe({
	paseoHome,
	fsImpl,
	readNetworkFileImpl,
	logger,
}) {
	const pidPath = path.join(paseoHome, "paseo.pid");
	if (fsImpl.existsSync(pidPath)) {
		logger.error(
			`Found ${pidPath} without config.json. Refusing to inspect or take over this Paseo home; stop or migrate its daemon, or remove the stale PID file after verifying no Paseo process uses it, then retry.`,
		);
		return false;
	}
	const listenIsFree = defaultListenIsFree(readNetworkFileImpl);
	if (listenIsFree === false) {
		logger.error(
			`${DEFAULT_LISTEN} is already serving another Paseo daemon. Stop or reconfigure that daemon, or configure this home with a different listen address, then retry.`,
		);
		return false;
	}
	if (listenIsFree === null) {
		logger.error(
			`Could not verify that ${DEFAULT_LISTEN} is free without starting Paseo. Inspect /proc/net/tcp and retry.`,
		);
		return false;
	}
	return true;
}

function systemdValue(value) {
	const escaped = value.replaceAll("%", "%%");
	if (/^[A-Za-z0-9_./:@+-]+$/.test(escaped)) return escaped;
	return `"${escaped.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function buildUnit({ cli, home, nodePath }) {
	const paseoHome = path.join(home, ".paseo");
	const searchPath = [
		path.dirname(nodePath),
		path.dirname(cli),
		path.join(home, ".bun", "bin"),
		path.join(home, ".local", "share", "mise", "shims"),
		path.join(home, ".cargo", "bin"),
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
	].filter((entry, index, entries) => entries.indexOf(entry) === index);
	return `# Managed by Haoshoku
[Unit]
Description=Paseo headless daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=${systemdValue(`PATH=${searchPath.join(":")}`)}
UnsetEnvironment=PASEO_HOME PASEO_HOST PASEO_PASSWORD PASEO_LISTEN PASEO_RELAY_ENABLED PASEO_WEB_UI_ENABLED
ExecStart=${systemdValue(cli)} daemon start --foreground --home ${systemdValue(paseoHome)}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function writeManagedUnit(unitPath, content, fsImpl, logger) {
	if (fsImpl.existsSync(unitPath)) {
		const existing = fsImpl.readFileSync(unitPath, "utf8");
		if (existing === content) return { changed: false, valid: true };
		if (!existing.startsWith("# Managed by Haoshoku\n")) {
			logger.error(
				`Refusing to replace foreign unit ${unitPath}. Disable or migrate it, then retry.`,
			);
			return { changed: false, valid: false };
		}
	}
	fsImpl.mkdirSync(path.dirname(unitPath), { recursive: true });
	fsImpl.writeFileSync(unitPath, content, { mode: 0o644 });
	fsImpl.chmodSync(unitPath, 0o644);
	return { changed: true, valid: true };
}

function inspectManagedUnit(unitPath, fsImpl, logger) {
	if (!fsImpl.existsSync(unitPath)) return { exists: false, managed: false };
	const managed = fsImpl
		.readFileSync(unitPath, "utf8")
		.startsWith("# Managed by Haoshoku\n");
	if (!managed) {
		logger.error(
			`Refusing to replace foreign unit ${unitPath}. Disable or migrate it, then retry.`,
		);
	}
	return { exists: true, managed };
}

function parseStatus(result, paseoHome) {
	if (result.exitCode !== 0) return null;
	try {
		const status = JSON.parse(result.stdout);
		if (!status || typeof status !== "object" || Array.isArray(status))
			return null;
		if (path.resolve(status.home) !== path.resolve(paseoHome)) return null;
		return status;
	} catch {
		return null;
	}
}

async function readStatus(cli, paseoHome, runner, env) {
	return parseStatus(
		await runner([cli, "daemon", "status", "--json", "--home", paseoHome], {
			env,
		}),
		paseoHome,
	);
}

async function systemdProperty(runner, env, property) {
	const result = await runner(
		["systemctl", "--user", "show", UNIT, "--property", property, "--value"],
		{ env },
	);
	return result.exitCode === 0 ? result.stdout.trim() : null;
}

function readParentPid(pid, readProcessFileImpl) {
	try {
		const stat = readProcessFileImpl(pid, "stat");
		const suffix = stat
			.slice(stat.lastIndexOf(")") + 2)
			.trim()
			.split(/\s+/);
		const parent = Number(suffix[1]);
		return Number.isInteger(parent) && parent > 0 ? parent : null;
	} catch {
		return null;
	}
}

function processBelongsToUnit(pid, mainPid, controlGroup, readProcessFileImpl) {
	if (
		!Number.isInteger(pid) ||
		pid <= 0 ||
		!Number.isInteger(mainPid) ||
		mainPid <= 0
	)
		return false;
	try {
		const memberships = readProcessFileImpl(pid, "cgroup")
			.split("\n")
			.map((line) => line.slice(line.indexOf("::") + 2));
		if (
			controlGroup &&
			memberships.some(
				(group) =>
					group === controlGroup || group.startsWith(`${controlGroup}/`),
			)
		) {
			return true;
		}
	} catch {
		// Fall back to bounded ancestry for non-unified or restricted /proc.
	}
	let current = pid;
	for (let depth = 0; depth < 32 && current > 1; depth += 1) {
		if (current === mainPid) return true;
		current = readParentPid(current, readProcessFileImpl);
		if (!current) return false;
	}
	return false;
}

async function serviceIsActive(runner, env) {
	const result = await runner(["systemctl", "--user", "is-active", UNIT], {
		env,
	});
	return result.exitCode === 0 && result.stdout.trim() === "active";
}

async function statusProcessBelongsToService({
	status,
	uid,
	runner,
	env,
	readProcessFileImpl,
}) {
	if (
		status.localDaemon !== "running" ||
		status.desktopManaged === true ||
		!Number.isInteger(status.pid) ||
		Number.parseInt(status.owner?.split("@", 1)[0], 10) !== uid ||
		!(await serviceIsActive(runner, env))
	) {
		return false;
	}
	const mainPid = Number(await systemdProperty(runner, env, "MainPID"));
	const controlGroup = await systemdProperty(runner, env, "ControlGroup");
	return processBelongsToUnit(
		status.pid,
		mainPid,
		controlGroup,
		readProcessFileImpl,
	);
}

async function statusBelongsToService(options) {
	return (
		daemonIsContactable(options.status) &&
		(await statusProcessBelongsToService(options))
	);
}

function daemonIsContactable(status) {
	return CONTACTABLE_DAEMON_STATES.has(status.connectedDaemon);
}

async function ensureEnabled(runner, env, logger) {
	const inspect = () =>
		runner(["systemctl", "--user", "is-enabled", UNIT], { env });
	let current = await inspect();
	if (current.exitCode === 0 && current.stdout.trim() === "enabled")
		return true;
	const enable = await runner(["systemctl", "--user", "enable", UNIT], { env });
	if (enable.exitCode === 0) current = await inspect();
	if (current.exitCode === 0 && current.stdout.trim() === "enabled") return true;
	logger.error(`Could not enable and verify ${UNIT}.`);
	return false;
}

async function ensureLinger(runner, env, user, logger) {
	const inspect = () =>
		runner(["loginctl", "show-user", user, "--property", "Linger", "--value"], {
			env,
		});
	let linger = await inspect();
	if (linger.exitCode === 0 && linger.stdout.trim() === "yes") return true;
	const enable = await runner(["loginctl", "enable-linger", user], { env });
	if (enable.exitCode === 0) linger = await inspect();
	if (linger.exitCode === 0 && linger.stdout.trim() === "yes") return true;
	logger.error(
		`Could not enable and verify user lingering. Retry: loginctl enable-linger ${user}`,
	);
	return false;
}

export async function configurePaseoServer(options = {}) {
	const home = options.home ?? homedir();
	const uid = options.uid ?? process.getuid?.();
	const user = options.user ?? userInfo().username;
	const fsImpl = options.fsImpl ?? fs;
	const runner = options.runProcessImpl ?? runProcess;
	const logger = options.logger ?? log;
	const prompt = options.promptImpl ?? promptUser;
	const isTTY =
		options.isTTY ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
	const sleep = options.sleepImpl ?? Bun.sleep;
	const readyAttempts = options.readyAttempts ?? READY_ATTEMPTS;
	const readProcessFileImpl =
		options.readProcessFileImpl ??
		((pid, filename) =>
			fsImpl.readFileSync(`/proc/${pid}/${filename}`, "utf8"));
	const readNetworkFileImpl =
		options.readNetworkFileImpl ??
		((filename) => fsImpl.readFileSync(filename, "utf8"));
	const env = cleanEnvironment(options.environment ?? process.env);
	const paseoHome = path.join(home, ".paseo");
	const configPath = path.join(paseoHome, "config.json");
	const unitPath = path.join(home, ".config", "systemd", "user", UNIT);

	if (uid === 0 || user === "root") {
		logger.error(
			"Refusing to configure Paseo as root. Re-run Haoshoku as the normal login user (sudo is requested only for Node.js installation when needed).",
		);
		return false;
	}
	const configState = validateExistingConfig(configPath, fsImpl, logger);
	if (!configState) return false;
	const unitState = inspectManagedUnit(unitPath, fsImpl, logger);
	if (unitState.exists && !unitState.managed) return false;
	const runtime = await ensureNodeRuntime(runner, env, logger);
	if (!runtime) return false;
	const cli = await ensurePaseoCli({ home, fsImpl, runner, env, logger });
	if (!cli) return false;
	const manager = await runner(["systemctl", "--user", "--version"], { env });
	if (manager.exitCode !== 0) {
		logger.error(
			"systemctl --user is unavailable. Log in through a systemd session and retry.",
		);
		return false;
	}
	const currentConfigState = validateExistingConfig(configPath, fsImpl, logger);
	if (!currentConfigState) return false;
	if (
		!currentConfigState.exists &&
		(!freshHomeIsSafe({
			paseoHome,
			fsImpl,
			readNetworkFileImpl,
			logger,
		}) ||
			!createFreshConfig(configPath, fsImpl, logger))
	)
		return false;

	const unitContent = buildUnit({ cli, home, nodePath: runtime.path });
	let status = await readStatus(cli, paseoHome, runner, env);
	if (!status) {
		logger.error(
			`Paseo status could not be read for ${paseoHome}. Inspect with: ${cli} daemon status --home ${paseoHome}`,
		);
		return false;
	}
	if (status.localDaemon === "stopped" && daemonIsContactable(status)) {
		logger.error(
			`${status.listen ?? "The configured listen address"} is already serving another Paseo daemon while ${paseoHome} is stopped. Stop or reconfigure that daemon, or configure this home with a different listen address, then retry.`,
		);
		return false;
	}
	const daemonRunning =
		status.localDaemon === "running" || daemonIsContactable(status);
	const managedProcess =
		unitState.managed &&
		(await statusProcessBelongsToService({
			status,
			uid,
			runner,
			env,
			readProcessFileImpl,
		}));
	const managedAndReady = managedProcess && daemonIsContactable(status);
	if (daemonRunning && !managedProcess) {
		logger.error(
			`An unmanaged or desktop Paseo daemon is already using ${paseoHome}. Stop it explicitly, confirm "${cli} daemon status --home ${paseoHome}" reports stopped, then retry.`,
		);
		return false;
	}
	const unitWrite = writeManagedUnit(unitPath, unitContent, fsImpl, logger);
	if (!unitWrite.valid) return false;
	if (unitWrite.changed) {
		const reload = await runner(["systemctl", "--user", "daemon-reload"], {
			env,
		});
		if (reload.exitCode !== 0) {
			logger.error("Could not reload the systemd user manager.");
			return false;
		}
	}
	if (!(await ensureEnabled(runner, env, logger))) return false;
	if (!(await ensureLinger(runner, env, user, logger))) return false;

	if (unitWrite.changed || !managedAndReady) {
		const active = await serviceIsActive(runner, env);
		const action = active ? "restart" : "start";
		const started = await runner(["systemctl", "--user", action, UNIT], {
			env,
		});
		if (started.exitCode !== 0) {
			logger.error(
				`Could not ${action} ${UNIT}. Inspect: journalctl --user -u ${UNIT} -n 100`,
			);
			return false;
		}
		let ready = false;
		for (let attempt = 0; attempt < readyAttempts; attempt += 1) {
			status = await readStatus(cli, paseoHome, runner, env);
			if (
				status &&
				(await statusBelongsToService({
					status,
					uid,
					runner,
					env,
					readProcessFileImpl,
				}))
			) {
				ready = true;
				break;
			}
			if (attempt < readyAttempts - 1) await sleep(READY_INTERVAL_MS);
		}
		if (!ready) {
			logger.error(
				`Paseo did not become ready under ${UNIT}. Inspect: journalctl --user -u ${UNIT} -n 100`,
			);
			return false;
		}
	}

	logger.success(
		`Paseo is configured and reachable through ${UNIT}; provider authentication and phone pairing are separate steps.`,
	);
	if (!isTTY) {
		logger.info(
			`Pair later from an interactive terminal: ${cli} daemon pair --relay --home ${paseoHome}`,
		);
		return true;
	}
	if (
		!(await prompt("Pair a phone through Paseo's encrypted relay now?", false))
	)
		return true;
	const paired = await runner(
		[cli, "daemon", "pair", "--relay", "--home", paseoHome],
		{ env, stdio: "inherit" },
	);
	if (paired.exitCode !== 0) {
		logger.error(
			`Pairing did not complete. The local daemon remains configured; retry: ${cli} daemon pair --relay --home ${paseoHome}`,
		);
		return false;
	}
	logger.success(
		"Pairing offer created. This does not authenticate any agent provider.",
	);
	return true;
}
