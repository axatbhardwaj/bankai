import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { log, safeCopyFile } from "../common/utils.js";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PROFILE_FIELDS = [
	"id",
	"name",
	"provider",
	"model",
	"modeId",
	"thinkingOptionId",
	"notes",
];
const PROVIDER_FIELDS = [
	"extends",
	"label",
	"description",
	"command",
	"enabled",
];
const RETIRED_MANAGED_PROFILE_REPLACEMENTS = new Map([
	["docs-muse", "docs-glm"],
	["pr-requirements-muse", "pr-requirements-glm"],
	["pr-monitor-muse", "pr-monitor-glm"],
]);

function isObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function selectFields(value, fields) {
	if (!isObject(value)) return {};
	return Object.fromEntries(
		fields
			.filter((field) => Object.hasOwn(value, field))
			.map((field) => [field, value[field]]),
	);
}

export function extractPaseoPolicy(config) {
	const profiles = Array.isArray(config?.daemon?.agentProfiles)
		? config.daemon.agentProfiles
				.filter(
					(profile) => isObject(profile) && typeof profile.id === "string",
				)
				.map((profile) => selectFields(profile, PROFILE_FIELDS))
		: [];
	const providers = Object.fromEntries(
		Object.entries(config?.agents?.providers ?? {})
			.filter(([, provider]) => isObject(provider))
			.map(([id, provider]) => [id, selectFields(provider, PROVIDER_FIELDS)]),
	);
	return { version: 1, agentProfiles: profiles, providers };
}

export function mergePaseoPolicy(liveConfig, policy) {
	const merged = structuredClone(liveConfig);
	merged.version ??= 1;
	merged.daemon = isObject(merged.daemon) ? merged.daemon : {};
	merged.agents = isObject(merged.agents) ? merged.agents : {};
	merged.agents.providers = isObject(merged.agents.providers)
		? merged.agents.providers
		: {};

	const managedIds = new Set(policy.agentProfiles.map(({ id }) => id));
	const retiredManagedIds = new Set(
		[...RETIRED_MANAGED_PROFILE_REPLACEMENTS]
			.filter(([, replacementId]) => managedIds.has(replacementId))
			.map(([retiredId]) => retiredId),
	);
	const unmanagedProfiles = Array.isArray(merged.daemon.agentProfiles)
		? merged.daemon.agentProfiles.filter(
				({ id } = {}) => !managedIds.has(id) && !retiredManagedIds.has(id),
			)
		: [];
	merged.daemon.agentProfiles = [
		...structuredClone(policy.agentProfiles),
		...unmanagedProfiles,
	];
	for (const [id, provider] of Object.entries(policy.providers)) {
		merged.agents.providers[id] = {
			...(isObject(merged.agents.providers[id])
				? merged.agents.providers[id]
				: {}),
			...structuredClone(provider),
		};
	}
	return merged;
}

function readJsonObject(file, fsImpl, logger) {
	try {
		const value = JSON.parse(fsImpl.readFileSync(file, "utf8"));
		if (!isObject(value)) throw new TypeError("root must be a JSON object");
		return value;
	} catch (error) {
		logger.error(`Invalid ${file}; leaving it untouched (${error.message}).`);
		return null;
	}
}

function writePolicy({
	source,
	destination,
	original,
	fsImpl,
	safeCopyFileImpl,
}) {
	fsImpl.mkdirSync(path.dirname(destination), { recursive: true });
	const stage = path.join(
		path.dirname(destination),
		`.${path.basename(destination)}.haoshoku-stage-${process.pid}`,
	);
	fsImpl.writeFileSync(stage, `${JSON.stringify(source, null, 2)}\n`, {
		mode: 0o600,
	});
	const assertUnchanged = () => {
		if (original === null) {
			if (fsImpl.existsSync(destination))
				throw new Error(`${destination} appeared during sync`);
			return;
		}
		if (
			!fsImpl.existsSync(destination) ||
			!fsImpl.readFileSync(destination).equals(original)
		) {
			throw new Error(`${destination} changed during sync`);
		}
	};
	try {
		safeCopyFileImpl(stage, destination, {
			atomic: true,
			beforeReplace: assertUnchanged,
			fsImpl,
		});
	} finally {
		fsImpl.rmSync(stage, { force: true });
	}
}

async function runProcess(args, options = {}) {
	try {
		const child = Bun.spawn(args, {
			env: options.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	} catch (error) {
		return { exitCode: 127, stdout: "", stderr: error.message };
	}
}

function cleanPaseoEnvironment(environment) {
	const clean = { ...environment };
	delete clean.PASEO_HOME;
	delete clean.PASEO_HOST;
	return clean;
}

function resolvePaseoCli(home, fsImpl, whichImpl) {
	return (
		whichImpl("paseo") ??
		(fsImpl.existsSync(path.join(home, ".local", "bin", "paseo"))
			? path.join(home, ".local", "bin", "paseo")
			: null)
	);
}

export async function syncPaseoProfiles({
	home = homedir(),
	projectRoot = PROJECT_ROOT,
	fsImpl = fs,
	safeCopyFileImpl = safeCopyFile,
	runProcessImpl = runProcess,
	whichImpl = Bun.which,
	environment = process.env,
	logger = log,
} = {}) {
	const paseoHome = path.join(home, ".paseo");
	const configPath = path.join(paseoHome, "config.json");
	const policyPath = path.join(
		projectRoot,
		"configs",
		"paseo",
		"agent-profiles.json",
	);
	const policy = readJsonObject(policyPath, fsImpl, logger);
	if (!policy) return false;

	const existed = fsImpl.existsSync(configPath);
	if (!existed && fsImpl.existsSync(path.join(paseoHome, "paseo.pid"))) {
		logger.error(
			`Found ${path.join(paseoHome, "paseo.pid")} without config.json. Refusing to modify this ambiguous Paseo home; stop or migrate its daemon, or remove a verified stale PID file, then retry.`,
		);
		return false;
	}
	const original = existed ? fsImpl.readFileSync(configPath) : null;
	const live = existed
		? readJsonObject(configPath, fsImpl, logger)
		: { version: 1 };
	if (!live) return false;

	try {
		writePolicy({
			source: mergePaseoPolicy(live, policy),
			destination: configPath,
			original,
			fsImpl,
			safeCopyFileImpl,
		});
	} catch (error) {
		logger.error(`Could not update ${configPath} (${error.message}).`);
		return false;
	}
	if (!existed) return true;

	const cli = resolvePaseoCli(home, fsImpl, whichImpl);
	if (!cli) {
		logger.info(
			"Paseo is not installed; policy will apply on the next daemon start.",
		);
		return true;
	}
	const env = cleanPaseoEnvironment(environment);
	const statusResult = await runProcessImpl(
		[cli, "daemon", "status", "--home", paseoHome, "--json"],
		{ env },
	);
	let status;
	try {
		status = JSON.parse(statusResult.stdout);
	} catch {
		status = null;
	}
	const listen = status?.listen ?? status?.daemon?.listen;
	if (
		statusResult.exitCode !== 0 ||
		status?.localDaemon !== "running" ||
		status?.home !== paseoHome ||
		typeof listen !== "string" ||
		listen.length === 0
	) {
		logger.info(
			"No running daemon for this exact Paseo home; policy will apply on its next start.",
		);
		return true;
	}

	const reload = await runProcessImpl(
		[cli, "reload", "--host", listen, "--json"],
		{ env },
	);
	if (reload.exitCode !== 0) {
		logger.error(
			`Paseo policy was written, but reload failed. Run: paseo reload --host ${listen}`,
		);
		return false;
	}
	try {
		const result = JSON.parse(reload.stdout);
		if (
			Array.isArray(result.restartRequiredPaths) &&
			result.restartRequiredPaths.length > 0
		) {
			logger.warning(
				`Paseo reload requires a daemon restart for: ${result.restartRequiredPaths.join(", ")}.`,
			);
		}
	} catch {
		// A successful CLI exit is authoritative even if it emits human-readable output.
	}
	logger.success("Paseo orchestration policy synced.");
	return true;
}

export function backupPaseoProfiles({
	home = homedir(),
	projectRoot = PROJECT_ROOT,
	fsImpl = fs,
	safeCopyFileImpl = safeCopyFile,
	logger = log,
} = {}) {
	const configPath = path.join(home, ".paseo", "config.json");
	if (!fsImpl.existsSync(configPath)) {
		logger.error(`Missing ${configPath}; no Paseo policy to back up.`);
		return false;
	}
	const config = readJsonObject(configPath, fsImpl, logger);
	if (!config) return false;
	const destination = path.join(
		projectRoot,
		"configs",
		"paseo",
		"agent-profiles.json",
	);
	try {
		writePolicy({
			source: extractPaseoPolicy(config),
			destination,
			original: fsImpl.existsSync(destination)
				? fsImpl.readFileSync(destination)
				: null,
			fsImpl,
			safeCopyFileImpl,
		});
		logger.success("Paseo orchestration policy backed up without credentials.");
		return true;
	} catch (error) {
		logger.error(`Could not back up Paseo policy (${error.message}).`);
		return false;
	}
}
