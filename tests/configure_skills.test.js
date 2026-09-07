import { describe, expect, it } from "bun:test";
import {
	configureSkills,
	LIST_GLOBAL_SKILLS_COMMAND,
	listSkills,
	MATT_POCOCK_SKILLS_COMMAND,
	MATT_POCOCK_SKILLS_SOURCE,
	PASEO_SKILLS_COMMAND,
	PASEO_SKILLS_SOURCE,
} from "../src/helpers/configure_skills.js";

describe("external skill management", () => {
	it("pins both declarative sources", () => {
		expect(MATT_POCOCK_SKILLS_SOURCE).toBe("mattpocock/skills");
		expect(MATT_POCOCK_SKILLS_COMMAND).toBe(
			"npx -y skills@latest add mattpocock/skills -g -a claude-code codex -s '*' -y --full-depth",
		);
		expect(PASEO_SKILLS_SOURCE).toBe("getpaseo/paseo");
		expect(PASEO_SKILLS_COMMAND).toBe(
			"bunx skills@latest add getpaseo/paseo -g -a claude-code codex -s '*' -y",
		);
	});

	it("syncs Matt then Paseo for Claude Code and Codex", async () => {
		const commands = [];
		expect(
			await configureSkills({
				run: async (command) => {
					commands.push(command);
					return true;
				},
			}),
		).toBe(true);
		expect(commands).toEqual([
			MATT_POCOCK_SKILLS_COMMAND,
			PASEO_SKILLS_COMMAND,
		]);
	});

	it("runs both sources and reports either failure without throwing", async () => {
		const failedCommands = [];
		expect(
			await configureSkills({
				run: async (command) => {
					failedCommands.push(command);
					return command !== PASEO_SKILLS_COMMAND;
				},
			}),
		).toBe(false);
		expect(failedCommands).toEqual([
			MATT_POCOCK_SKILLS_COMMAND,
			PASEO_SKILLS_COMMAND,
		]);
		expect(
			await configureSkills({
				run: async () => {
					throw new Error("offline");
				},
			}),
		).toBe(false);
	});

	it("lists the Skills CLI global inventory", async () => {
		const commands = [];
		expect(
			await listSkills({
				run: async (command) => {
					commands.push(command);
					return true;
				},
			}),
		).toBe(true);
		expect(commands).toEqual([LIST_GLOBAL_SKILLS_COMMAND]);
	});
});
