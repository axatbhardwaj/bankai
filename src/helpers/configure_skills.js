import { log, runCommand } from "../common/utils.js";

export const MATT_POCOCK_SKILLS_SOURCE = "mattpocock/skills";
export const MATT_POCOCK_SKILLS_COMMAND =
	"npx -y skills@latest add mattpocock/skills -g -a claude-code codex -s '*' -y --full-depth";
export const PASEO_SKILLS_SOURCE = "getpaseo/paseo";
export const PASEO_SKILLS_COMMAND =
	"bunx skills@latest add getpaseo/paseo -g -a claude-code codex -s '*' -y";
export const LIST_GLOBAL_SKILLS_COMMAND = "npx -y skills@latest list -g";

async function runSkillsCommand(command, messages, run = runCommand) {
	log.info(messages.start);
	try {
		if (!(await run(command))) {
			log.error(messages.failure);
			return false;
		}
		log.success(messages.success);
		return true;
	} catch (error) {
		log.error(`${messages.failure} (${error?.message ?? error})`);
		return false;
	}
}

/** Install or refresh the external skill sources used by Haoshoku. */
export async function configureSkills({ run = runCommand } = {}) {
	const mattReady = await runSkillsCommand(
		MATT_POCOCK_SKILLS_COMMAND,
		{
			start: "Syncing Matt Pocock skills for Claude Code and Codex...",
			success: "Matt Pocock skills synced.",
			failure: "Syncing Matt Pocock skills failed.",
		},
		run,
	);
	const paseoReady = await runSkillsCommand(
		PASEO_SKILLS_COMMAND,
		{
			start: "Syncing Paseo orchestration skills for Claude Code and Codex...",
			success: "Paseo orchestration skills synced.",
			failure: "Syncing Paseo orchestration skills failed.",
		},
		run,
	);
	return mattReady && paseoReady;
}

/** Show the Skills CLI's authoritative global inventory. */
export async function listSkills({ run = runCommand } = {}) {
	return runSkillsCommand(
		LIST_GLOBAL_SKILLS_COMMAND,
		{
			start: "Listing globally installed skills...",
			success: "Globally installed skills listed.",
			failure: "Listing globally installed skills failed.",
		},
		run,
	);
}
