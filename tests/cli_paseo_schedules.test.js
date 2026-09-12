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
	const home = fs.mkdtempSync(
		path.join(os.tmpdir(), "haoshoku-cli-paseo-schedules-"),
	);
	roots.push(home);
	return {
		configPath: path.join(home, ".config", "haoshoku", "paseo-schedules.json"),
		home,
	};
}

function run(home, ...args) {
	return Bun.spawnSync([process.execPath, CLI, ...args], {
		env: {
			...process.env,
			HOME: home,
			PASEO_HOME: "/foreign/home",
			PASEO_HOST: "ssh://foreign-host",
		},
		stderr: "pipe",
		stdout: "pipe",
	});
}

describe("Paseo schedules CLI", () => {
	it("initializes unmapped defaults noninteractively without daemon side effects", () => {
		const { configPath, home } = fixture();

		const result = run(home, "--paseo-schedules");

		expect(result.exitCode).toBe(0);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			version: 1,
			roles: {
				staleArchive: {
					scheduleId: null,
					provider: "claude",
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				},
				worktreeCleaner: {
					scheduleId: null,
					provider: "claude",
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				},
				mergeReadiness: {
					scheduleId: null,
					provider: "codex",
					model: "gpt-5.6-luna",
					thinkingOptionId: "high",
				},
			},
		});
		expect(fs.existsSync(path.join(home, ".paseo"))).toBe(false);
	});

	for (const flag of ["--paseo-schedules-check", "--paseo-schedules-apply"]) {
		it(`${flag} reports all unmapped roles and performs no schedule IO`, () => {
			const { configPath, home } = fixture();
			expect(run(home, "--paseo-schedules").exitCode).toBe(0);
			const before = fs.readFileSync(configPath);

			const result = run(home, flag);
			const output = result.stdout.toString();

			expect(result.exitCode).toBe(0);
			expect(output).toContain("staleArchive: skipped (unmapped)");
			expect(output).toContain("worktreeCleaner: skipped (unmapped)");
			expect(output).toContain("mergeReadiness: skipped (unmapped)");
			expect(fs.readFileSync(configPath)).toEqual(before);
			expect(
				fs.existsSync(
					path.join(home, ".config", "haoshoku", "paseo-schedule-backups"),
				),
			).toBe(false);
			expect(fs.existsSync(path.join(home, ".paseo"))).toBe(false);
		});
	}

	it("rejects combining schedule configure, check, or apply modes", () => {
		const { home } = fixture();
		const result = run(
			home,
			"--paseo-schedules-check",
			"--paseo-schedules-apply",
		);

		expect(result.exitCode).toBe(2);
		expect(result.stderr.toString()).toContain("mutually exclusive");
	});
});
