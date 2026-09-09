import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { log } from "../common/utils.js";

export const DEFAULT_PASEO_TASKS_CONFIG = Object.freeze({
	enabled: true,
	renameChats: true,
	cleanup: "archive",
});

function configPath(home) {
	return path.join(home, ".config", "haoshoku", "paseo-tasks.json");
}

function validateConfig(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new TypeError("root must be an object");
	}
	if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
		throw new TypeError("enabled must be a boolean");
	}
	if (
		value.renameChats !== undefined &&
		typeof value.renameChats !== "boolean"
	) {
		throw new TypeError("renameChats must be a boolean");
	}
	if (
		value.cleanup !== undefined &&
		!["archive", "keep"].includes(value.cleanup)
	) {
		throw new TypeError("cleanup must be archive or keep");
	}
}

function readConfig(file, fsImpl, logger) {
	if (!fsImpl.existsSync(file)) return { exists: false, value: {} };
	try {
		const value = JSON.parse(fsImpl.readFileSync(file, "utf8"));
		validateConfig(value);
		return { exists: true, value };
	} catch (error) {
		logger.error(`Invalid ${file}; leaving it untouched (${error.message}).`);
		return null;
	}
}

function writeConfig(file, value, fsImpl, logger) {
	const directory = path.dirname(file);
	const stage = path.join(directory, `.paseo-tasks.json.stage-${process.pid}`);
	try {
		fsImpl.mkdirSync(directory, { recursive: true });
		fsImpl.writeFileSync(stage, `${JSON.stringify(value, null, 2)}\n`, {
			mode: 0o600,
		});
		fsImpl.renameSync(stage, file);
		return true;
	} catch (error) {
		logger.error(`Could not update ${file} (${error.message}).`);
		return false;
	} finally {
		if (fsImpl.existsSync(stage)) fsImpl.rmSync(stage, { force: true });
	}
}

export function ensurePaseoTaskConfig({
	home = homedir(),
	fsImpl = fs,
	logger = log,
} = {}) {
	const file = configPath(home);
	const current = readConfig(file, fsImpl, logger);
	if (!current) return false;
	const complete = Object.keys(DEFAULT_PASEO_TASKS_CONFIG).every((key) =>
		Object.hasOwn(current.value, key),
	);
	if (current.exists && complete) return true;
	if (
		!writeConfig(
			file,
			{ ...DEFAULT_PASEO_TASKS_CONFIG, ...current.value },
			fsImpl,
			logger,
		)
	) {
		return false;
	}
	logger.success("Paseo task lifecycle defaults configured.");
	return true;
}

export function setPaseoTaskConfig(
	updates,
	{ home = homedir(), fsImpl = fs, logger = log } = {},
) {
	const file = configPath(home);
	const current = readConfig(file, fsImpl, logger);
	if (!current) return false;
	const next = {
		...DEFAULT_PASEO_TASKS_CONFIG,
		...current.value,
		...updates,
	};
	try {
		validateConfig(next);
	} catch (error) {
		logger.error(`Invalid Paseo task lifecycle setting (${error.message}).`);
		return false;
	}
	if (!writeConfig(file, next, fsImpl, logger)) return false;
	logger.success("Paseo task lifecycle policy updated.");
	return true;
}
