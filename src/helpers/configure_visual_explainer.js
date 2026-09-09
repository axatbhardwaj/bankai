import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { log } from "../common/utils.js";

export const EXPLAINER_THEMES = ["dark", "light", "system"];
const DEFAULT_EXPLAINER_THEME = "dark";

function configPath(home) {
	return path.join(home, ".config", "haoshoku", "visual-explainer.json");
}

function readConfig(file, fsImpl, logger) {
	if (!fsImpl.existsSync(file)) return { exists: false, value: {} };
	try {
		const value = JSON.parse(fsImpl.readFileSync(file, "utf8"));
		if (!value || typeof value !== "object" || Array.isArray(value)) {
			throw new TypeError("root must be an object");
		}
		if (!EXPLAINER_THEMES.includes(value.theme)) {
			throw new TypeError("theme must be dark, light, or system");
		}
		return { exists: true, value };
	} catch (error) {
		logger.error(`Invalid ${file}; leaving it untouched (${error.message}).`);
		return null;
	}
}

export function readExplainerTheme({
	home = homedir(),
	fsImpl = fs,
	logger = log,
} = {}) {
	const config = readConfig(configPath(home), fsImpl, logger);
	return config?.value.theme ?? DEFAULT_EXPLAINER_THEME;
}

export function setExplainerTheme(
	theme,
	{ home = homedir(), fsImpl = fs, logger = log } = {},
) {
	if (!EXPLAINER_THEMES.includes(theme)) {
		logger.error("Explainer theme must be dark, light, or system.");
		return false;
	}
	const file = configPath(home);
	const current = readConfig(file, fsImpl, logger);
	if (!current) return false;
	const next = { ...current.value, theme };
	const directory = path.dirname(file);
	const stage = path.join(
		directory,
		`.visual-explainer.json.stage-${process.pid}`,
	);
	try {
		fsImpl.mkdirSync(directory, { recursive: true });
		fsImpl.writeFileSync(stage, `${JSON.stringify(next, null, 2)}\n`, {
			mode: 0o600,
		});
		fsImpl.renameSync(stage, file);
		logger.success(`Visual explainer theme set to ${theme}.`);
		return true;
	} catch (error) {
		logger.error(`Could not update ${file} (${error.message}).`);
		return false;
	} finally {
		if (fsImpl.existsSync(stage)) fsImpl.rmSync(stage, { force: true });
	}
}

export function ensureExplainerTheme(options = {}) {
	const home = options.home ?? homedir();
	const fsImpl = options.fsImpl ?? fs;
	const file = configPath(home);
	const current = readConfig(file, fsImpl, options.logger ?? log);
	if (!current) return false;
	if (current.exists) return true;
	return setExplainerTheme(DEFAULT_EXPLAINER_THEME, {
		...options,
		home,
		fsImpl,
	});
}
