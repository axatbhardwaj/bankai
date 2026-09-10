import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const roots = [];
const checker = path.resolve(
	import.meta.dir,
	"..",
	"configs",
	"agent-skills",
	"model-routing",
	"references",
	"hermes-relay-host-enabled",
);

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function checkMarker(value) {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-relay-host-"));
	roots.push(home);
	if (value !== undefined) {
		const directory = path.join(home, ".config", "haoshoku");
		fs.mkdirSync(directory, { recursive: true });
		fs.writeFileSync(path.join(directory, "hermes-relay.json"), value);
	}
	return Bun.spawnSync([checker], {
		env: { ...process.env, HOME: home },
		stderr: "pipe",
		stdout: "pipe",
	});
}

describe("Hermes relay host boundary", () => {
	it("allows relay transport only for the exact enabled v1 marker", () => {
		expect(checkMarker(undefined).exitCode).not.toBe(0);
		expect(checkMarker('{"version":1,"enabled":false}\n').exitCode).not.toBe(0);
		expect(checkMarker('{"version":2,"enabled":true}\n').exitCode).not.toBe(0);
		expect(checkMarker("not-json\n").exitCode).not.toBe(0);
		expect(checkMarker('{"version":1,"enabled":true}\n').exitCode).toBe(0);
	});

	it("makes every relay-using PR workflow require the marker check", () => {
		for (const relative of [
			"configs/agent-skills/model-routing/references/human-decisions.md",
			"configs/agent-skills/paseo-pr-review/SKILL.md",
			"configs/agent-skills/paseo-pr-babysit/SKILL.md",
		]) {
			const content = fs.readFileSync(
				path.resolve(import.meta.dir, "..", relative),
				"utf8",
			);
			expect(content).toContain("hermes-relay-host-enabled");
			expect(content).toContain("missing or disabled");
			expect(content).toContain("Paseo conversation");
		}
	});
});
