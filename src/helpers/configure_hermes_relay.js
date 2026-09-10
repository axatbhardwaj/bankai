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

function validManifest(source, fsImpl, logger) {
	const manifest = path.join(source, "plugin.yaml");
	try {
		const content = fsImpl.readFileSync(manifest, "utf8");
		if (!/^name:\s*paseo-review-relay\s*$/m.test(content)) {
			logger.error(
				`Refusing relay source without name: ${PLUGIN_NAME} in ${manifest}.`,
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

function resolveVendoredSource(projectRoot, fsImpl, logger) {
	const lockPath = path.join(
		projectRoot,
		"configs",
		"hermes-relay",
		"lock.json",
	);
	const lock = readJsonObject(lockPath, fsImpl, logger);
	if (!lock) return null;
	if (lock.version !== 1 || lock.commit !== null) {
		logger.error(
			`The transition lock ${lockPath} is not in vendored-fallback mode.`,
		);
		return null;
	}
	if (typeof lock.vendoredFallback !== "string") {
		logger.error(`The transition lock ${lockPath} has no vendoredFallback.`);
		return null;
	}
	const source = path.resolve(path.dirname(lockPath), lock.vendoredFallback);
	return validManifest(source, fsImpl, logger) ? source : null;
}

function sameBytes(left, right, fsImpl) {
	try {
		return fsImpl.readFileSync(left).equals(fsImpl.readFileSync(right));
	} catch {
		return false;
	}
}

function deployPlugin(source, target, fsImpl) {
	let changed = false;
	fsImpl.mkdirSync(target, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(target, 0o700);
	for (const file of HERMES_RELAY_PLUGIN_FILES) {
		const from = path.join(source, file);
		const to = path.join(target, file);
		if (!sameBytes(from, to, fsImpl)) {
			fsImpl.copyFileSync(from, to);
			changed = true;
		}
		fsImpl.chmodSync(to, file === "hermes-relay" ? 0o755 : 0o600);
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

function writePrivateConfig(file, value, fsImpl) {
	fsImpl.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 0o600,
	});
	fsImpl.chmodSync(file, 0o600);
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
	readTelegramIdentityImpl = async () => null,
} = {}) {
	void isTTY;
	void promptImpl;
	const hermesHome = environment.HERMES_HOME || path.join(home, ".hermes");
	const hermes = findExecutable(
		"hermes",
		[path.join(home, ".local", "bin", "hermes"), "/usr/local/bin/hermes"],
		whichImpl,
		fsImpl,
	);
	if (!hermes) {
		logger.error("Hermes is unavailable; relay configuration is incomplete.");
		return false;
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

	const source = resolveVendoredSource(projectRoot, fsImpl, logger);
	if (!source) return false;
	const pluginDirectory = path.join(hermesHome, "plugins", PLUGIN_NAME);
	if (
		fsImpl.existsSync(pluginDirectory) &&
		!validManifest(pluginDirectory, fsImpl, logger)
	) {
		logger.error(
			`Refusing to overwrite foreign plugin directory ${pluginDirectory}.`,
		);
		return false;
	}
	deployPlugin(source, pluginDirectory, fsImpl);
	if (ensureCliLink(home, pluginDirectory, fsImpl, logger) === null)
		return false;

	const dataDirectory = path.join(hermesHome, "plugin-data", PLUGIN_NAME);
	const configPath = path.join(dataDirectory, "config.json");
	fsImpl.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
	fsImpl.chmodSync(dataDirectory, 0o700);
	const config = fsImpl.existsSync(configPath)
		? readJsonObject(configPath, fsImpl, logger)
		: readJsonObject(path.join(source, "config.example.json"), fsImpl, logger);
	if (!config) return false;

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
		const telegram = await readTelegramIdentityImpl({
			hermesHome,
			environment,
		});
		if (telegram) {
			config.telegramChatId = telegram.chatId;
			config.telegramUserId = telegram.userId;
		}
	}
	writePrivateConfig(configPath, config, fsImpl);

	if (
		!isPrivateId(config.telegramChatId, { allowNegative: true }) ||
		!isPrivateId(config.telegramUserId)
	) {
		logger.error(
			`Hermes relay configuration is incomplete. Set telegramChatId and telegramUserId in ${configPath}, then retry: haoshoku --server-hermes-relay`,
		);
		return false;
	}

	return false;
}
