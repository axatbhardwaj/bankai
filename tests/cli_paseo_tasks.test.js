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
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-paseo-tasks-"));
	roots.push(home);
	return {
		configPath: path.join(home, ".config", "haoshoku", "paseo-tasks.json"),
		home,
	};
}

function run(home, ...args) {
	return Bun.spawnSync([process.execPath, CLI, ...args], {
		env: { ...process.env, HOME: home },
		stderr: "pipe",
		stdout: "pipe",
	});
}

describe("Paseo task lifecycle CLI", () => {
	it("creates the enabled naming and archive defaults", () => {
		const { configPath, home } = fixture();

		const result = run(home, "--paseo-tasks");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			enabled: true,
			renameChats: true,
			cleanup: "archive",
		});
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
	});

	it("fills missing defaults without replacing explicit or custom fields", () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(
			configPath,
			'{\n  "cleanup": "keep",\n  "owner": "axat"\n}\n',
		);

		const result = run(home, "--paseo-tasks");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			enabled: true,
			renameChats: true,
			cleanup: "keep",
			owner: "axat",
		});
	});

	it("sets keep cleanup while preserving custom fields", () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{\n  "owner": "axat"\n}\n');

		const result = run(home, "--paseo-task-cleanup", "keep");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			owner: "axat",
			enabled: true,
			renameChats: true,
			cleanup: "keep",
		});
	});

	it("disables chat renaming without disabling task lifecycle", () => {
		const { configPath, home } = fixture();

		const result = run(home, "--paseo-task-renaming", "disabled");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			enabled: true,
			renameChats: false,
			cleanup: "archive",
		});
	});

	it("disables lifecycle without changing naming or cleanup choices", () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(
			configPath,
			'{\n  "enabled": true,\n  "renameChats": false,\n  "cleanup": "keep"\n}\n',
		);

		const result = run(home, "--paseo-tasks-enabled", "disabled");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			enabled: false,
			renameChats: false,
			cleanup: "keep",
		});
	});

	for (const [label, content] of [
		["malformed JSON", '{"enabled":true'],
		[
			"invalid owned fields",
			'{"enabled":"yes","renameChats":true,"cleanup":"delete"}\n',
		],
	]) {
		it(`leaves ${label} untouched and exits nonzero`, () => {
			const { configPath, home } = fixture();
			fs.mkdirSync(path.dirname(configPath), { recursive: true });
			fs.writeFileSync(configPath, content);
			const before = fs.readFileSync(configPath);

			const result = run(home, "--paseo-task-cleanup", "archive");

			expect(result.exitCode).toBe(1);
			expect(fs.readFileSync(configPath)).toEqual(before);
		});
	}

	it("rejects invalid CLI values without creating config", () => {
		const { configPath, home } = fixture();

		const result = run(home, "--paseo-task-renaming", "sometimes");

		expect(result.exitCode).toBe(1);
		expect(fs.existsSync(configPath)).toBe(false);
	});

	for (const [flag, message] of [
		[
			"--paseo-tasks-enabled",
			"Paseo task lifecycle must be enabled or disabled.",
		],
		["--paseo-task-cleanup", "cleanup must be archive or keep"],
		[
			"--paseo-task-renaming",
			"Paseo task renaming must be enabled or disabled.",
		],
	]) {
		it(`rejects an explicitly empty ${flag} value before OS setup`, () => {
			const { configPath, home } = fixture();

			const result = run(home, flag, "", "--os", "unsupported");
			const stderr = result.stderr.toString();

			expect(result.exitCode).toBe(1);
			expect(stderr).toContain(message);
			expect(stderr).not.toContain("Unsupported OS");
			expect(fs.existsSync(configPath)).toBe(false);
		});
	}
});
