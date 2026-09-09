import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLI = path.resolve(import.meta.dir, "..", "haoshoku.js");
const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-theme-cli-"));
	roots.push(home);
	return {
		configPath: path.join(home, ".config", "haoshoku", "visual-explainer.json"),
		home,
	};
}

function run(home, theme) {
	return Bun.spawnSync([process.execPath, CLI, "--explainer-theme", theme], {
		env: { ...process.env, HOME: home },
		stderr: "pipe",
		stdout: "pipe",
	});
}

describe("--explainer-theme", () => {
	it("persists a valid choice through the real CLI", () => {
		const { configPath, home } = fixture();

		const result = run(home, "light");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			theme: "light",
		});
	});

	it("returns failure and preserves bytes for an invalid choice", () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{\n  "theme": "system"\n}\n');
		const before = fs.readFileSync(configPath);

		const result = run(home, "sepia");

		expect(result.exitCode).toBe(1);
		expect(fs.readFileSync(configPath)).toEqual(before);
	});
});
