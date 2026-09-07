import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { copyDirRecursive, log } from "../common/utils.js";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export const AGENT_SKILLS = [
	"model-routing",
	"paseo-pr-babysit",
	"paseo-pr-review",
	"html-deliverables",
];

export const REFERENCED_SKILLS = [
	"paseo",
	"paseo-advisor",
	"paseo-committee",
	"paseo-handoff",
	"paseo-help",
	"paseo-plugin",
	"code-review",
	"grill-with-docs",
	"to-spec",
	"to-tickets",
	"implement",
	"implement-spec",
];

function reconcileSkillLink({ home, agentHome, name, fsImpl, logger }) {
	const link = path.join(home, agentHome, "skills", name);
	const target = `../../.agents/skills/${name}`;
	const existing = fsImpl.lstatSync(link, { throwIfNoEntry: false });
	if (existing?.isSymbolicLink()) {
		if (fsImpl.readlinkSync(link) === target) return;
		fsImpl.unlinkSync(link);
	} else if (existing) {
		logger.warning(`Leaving real directory ${link} untouched.`);
		return;
	}
	fsImpl.mkdirSync(path.dirname(link), { recursive: true });
	fsImpl.symlinkSync(target, link);
}

export function syncAgentSkills({
	home = homedir(),
	projectRoot = PROJECT_ROOT,
	fsImpl = fs,
	copyDirImpl = copyDirRecursive,
	logger = log,
} = {}) {
	const bundled = path.join(projectRoot, "configs", "agent-skills");
	const live = path.join(home, ".agents", "skills");
	let complete = true;

	for (const name of AGENT_SKILLS) {
		const source = path.join(bundled, name);
		if (!fsImpl.existsSync(source)) {
			logger.warning(`Missing bundled owned skill ${name}; sync skipped.`);
			complete = false;
			continue;
		}
		copyDirImpl(source, path.join(live, name));
		for (const agentHome of [".claude", ".codex"]) {
			reconcileSkillLink({ home, agentHome, name, fsImpl, logger });
		}
	}

	for (const name of REFERENCED_SKILLS) {
		if (!fsImpl.existsSync(path.join(live, name))) {
			logger.warning(
				`Referenced skill ${name} is unavailable; rerun haoshoku --skills or install its declared source.`,
			);
		}
	}
	if (complete) logger.success("Haoshoku-owned agent skills synced.");
	return complete;
}

export function backupAgentSkills({
	home = homedir(),
	projectRoot = PROJECT_ROOT,
	fsImpl = fs,
	copyDirImpl = copyDirRecursive,
	logger = log,
} = {}) {
	const live = path.join(home, ".agents", "skills");
	const bundled = path.join(projectRoot, "configs", "agent-skills");
	let complete = true;
	for (const name of AGENT_SKILLS) {
		const source = path.join(live, name);
		if (!fsImpl.existsSync(source)) {
			logger.warning(`Missing owned skill ${source}; backup skipped.`);
			complete = false;
			continue;
		}
		const destination = path.join(bundled, name);
		fsImpl.rmSync(destination, { recursive: true, force: true });
		copyDirImpl(source, destination);
	}
	if (complete) logger.success("Haoshoku-owned agent skills backed up.");
	return complete;
}
