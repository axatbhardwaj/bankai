import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	AGENT_SKILLS,
	backupAgentSkills,
	syncAgentSkills,
} from "../src/helpers/configure_agent_skills.js";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-agent-skills-"));
	roots.push(root);
	const home = path.join(root, "home");
	const projectRoot = path.join(root, "project");
	for (const name of AGENT_SKILLS) {
		const skill = path.join(projectRoot, "configs", "agent-skills", name);
		fs.mkdirSync(skill, { recursive: true });
		fs.writeFileSync(path.join(skill, "SKILL.md"), `owned ${name}\n`);
	}
	return { home, projectRoot };
}

describe("Haoshoku-owned agent skills", () => {
	it("syncs owned skills and creates portable links for both agents", () => {
		const { home, projectRoot } = fixture();
		for (const name of ["paseo", "code-review"]) {
			fs.mkdirSync(path.join(home, ".agents", "skills", name), {
				recursive: true,
			});
		}

		expect(syncAgentSkills({ home, projectRoot })).toBe(true);
		for (const name of AGENT_SKILLS) {
			expect(
				fs.readFileSync(
					path.join(home, ".agents", "skills", name, "SKILL.md"),
					"utf8",
				),
			).toBe(`owned ${name}\n`);
			for (const agent of [".claude", ".codex"]) {
				expect(
					fs.readlinkSync(path.join(home, agent, "skills", name)),
				).toBe(`../../.agents/skills/${name}`);
			}
		}
	});

	it("replaces absolute links but preserves real skill directories", () => {
		const { home, projectRoot } = fixture();
		const name = AGENT_SKILLS[0];
		const claudeLink = path.join(home, ".claude", "skills", name);
		const codexDirectory = path.join(home, ".codex", "skills", name);
		fs.mkdirSync(path.dirname(claudeLink), { recursive: true });
		fs.symlinkSync(`/home/old/.agents/skills/${name}`, claudeLink);
		fs.mkdirSync(codexDirectory, { recursive: true });
		fs.writeFileSync(path.join(codexDirectory, "KEEP"), "user-owned\n");
		const warnings = [];

		expect(
			syncAgentSkills({
				home,
				logger: { info() {}, success() {}, warning: (value) => warnings.push(value) },
				projectRoot,
			}),
		).toBe(true);
		expect(fs.readlinkSync(claudeLink)).toBe(
			`../../.agents/skills/${name}`,
		);
		expect(fs.readFileSync(path.join(codexDirectory, "KEEP"), "utf8")).toBe(
			"user-owned\n",
		);
		expect(warnings.join("\n")).toContain("real directory");
	});

	it("warns without failing when referenced external skills are missing", () => {
		const { home, projectRoot } = fixture();
		const warnings = [];

		expect(
			syncAgentSkills({
				home,
				logger: { info() {}, success() {}, warning: (value) => warnings.push(value) },
				projectRoot,
			}),
		).toBe(true);
		expect(warnings.join("\n")).toContain("paseo");
		expect(warnings.join("\n")).toContain("code-review");
	});

	it("backs up only the owned allowlist byte-for-byte", () => {
		const { home, projectRoot } = fixture();
		const liveSkills = path.join(home, ".agents", "skills");
		for (const name of AGENT_SKILLS) {
			fs.mkdirSync(path.join(liveSkills, name), { recursive: true });
			fs.writeFileSync(path.join(liveSkills, name, "SKILL.md"), `live ${name}\n`);
		}
		fs.mkdirSync(path.join(liveSkills, "paseo"), { recursive: true });
		fs.writeFileSync(path.join(liveSkills, "paseo", "SKILL.md"), "upstream\n");

		expect(backupAgentSkills({ home, projectRoot })).toBe(true);
		for (const name of AGENT_SKILLS) {
			expect(
				fs.readFileSync(
					path.join(projectRoot, "configs", "agent-skills", name, "SKILL.md"),
					"utf8",
				),
			).toBe(`live ${name}\n`);
		}
		expect(
			fs.existsSync(
				path.join(projectRoot, "configs", "agent-skills", "paseo"),
			),
		).toBe(false);
	});
});
