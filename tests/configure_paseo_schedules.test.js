import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	applyPaseoSchedules,
	checkPaseoSchedules,
	configurePaseoSchedules,
	ensurePaseoSchedulesConfig,
} from "../src/helpers/configure_paseo_schedules.js";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const home = fs.mkdtempSync(
		path.join(os.tmpdir(), "haoshoku-paseo-schedules-"),
	);
	roots.push(home);
	return {
		configPath: path.join(home, ".config", "haoshoku", "paseo-schedules.json"),
		home,
	};
}

function storedSchedule(id, config = {}) {
	return {
		id,
		name: `Schedule ${id}`,
		prompt: `Prompt ${id}`,
		cadence: { type: "cron", expression: "0 9 * * *", timezone: "UTC" },
		target: {
			type: "new-agent",
			config: {
				provider: "claude",
				model: "claude-opus-5",
				modeId: "bypassPermissions",
				thinkingOptionId: "medium",
				cwd: "/srv/project",
				archiveOnFinish: true,
				isolation: "worktree",
				...config,
			},
		},
		status: "paused",
		createdAt: "2026-09-01T00:00:00.000Z",
		updatedAt: "2026-09-01T00:00:00.000Z",
		nextRunAt: null,
		lastRunAt: null,
		pausedAt: "2026-09-02T00:00:00.000Z",
		expiresAt: null,
		maxRuns: null,
		runs: [],
	};
}

function capabilityClient(schedules) {
	return {
		async getProvidersSnapshot() {
			return {
				entries: [
					{ provider: "claude", enabled: true, status: "ready" },
					{ provider: "codex", enabled: true, status: "ready" },
				],
			};
		},
		async listProviderModels(provider) {
			return {
				provider,
				models:
					provider === "claude"
						? [
								{
									provider,
									id: "claude-sonnet-5",
									label: "Sonnet 5",
									thinkingOptions: [{ id: "high", label: "High" }],
								},
							]
						: [
								{
									provider,
									id: "gpt-5.6-luna",
									label: "Luna",
									thinkingOptions: [{ id: "high", label: "High" }],
								},
							],
				error: null,
			};
		},
		async listProviderModes(provider) {
			return {
				provider,
				modes: [
					{ id: "bypassPermissions", label: "Bypass permissions" },
					{ id: "full-access", label: "Full access" },
				],
				error: null,
			};
		},
		async scheduleInspect({ id }) {
			return { schedule: structuredClone(schedules.get(id)), error: null };
		},
	};
}

async function mappedFixture() {
	const result = fixture();
	await ensurePaseoSchedulesConfig({ home: result.home, interactive: false });
	const config = JSON.parse(fs.readFileSync(result.configPath, "utf8"));
	config.roles.staleArchive.scheduleId = "schedule-archive";
	config.roles.worktreeCleaner.scheduleId = "schedule-cleaner";
	config.roles.mergeReadiness.scheduleId = "schedule-merge";
	fs.writeFileSync(result.configPath, `${JSON.stringify(config, null, 2)}\n`);
	return result;
}

describe("Paseo schedule configuration", () => {
	it("initializes three unmapped schedule roles with portable defaults", async () => {
		const { configPath, home } = fixture();

		expect(await ensurePaseoSchedulesConfig({ home, interactive: false })).toBe(
			true,
		);
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
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
	});

	it("interactively configures only the selected explicit role mapping", async () => {
		const { configPath, home } = fixture();
		const promptFn = async (questions) => {
			if (questions[0].name === "roles") {
				return { roles: ["mergeReadiness"] };
			}
			return {
				scheduleId: "schedule-merge",
				provider: "codex",
				model: "gpt-5.6-luna",
				thinkingOptionId: "high",
				modeId: "full-access",
			};
		};

		expect(
			await configurePaseoSchedules({ home, interactive: true, promptFn }),
		).toBe(true);
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		expect(config.roles.mergeReadiness).toEqual({
			scheduleId: "schedule-merge",
			provider: "codex",
			model: "gpt-5.6-luna",
			thinkingOptionId: "high",
			modeId: "full-access",
		});
		expect(config.roles.staleArchive.scheduleId).toBeNull();
		expect(config.roles.worktreeCleaner.scheduleId).toBeNull();
	});

	it("leaves malformed configuration byte-for-byte unchanged", async () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{"version":1,"roles":');
		const before = fs.readFileSync(configPath);
		const errors = [];

		expect(
			await ensurePaseoSchedulesConfig({
				home,
				interactive: false,
				logger: { error: (message) => errors.push(message) },
			}),
		).toBe(false);
		expect(fs.readFileSync(configPath)).toEqual(before);
		expect(errors[0]).toContain("leaving it untouched");
	});

	it("refuses duplicate schedule IDs without rewriting configuration", async () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		const content = `${JSON.stringify(
			{
				version: 1,
				roles: {
					staleArchive: {
						scheduleId: "schedule-1",
						provider: "claude",
						model: "claude-sonnet-5",
						thinkingOptionId: "high",
					},
					worktreeCleaner: {
						scheduleId: "schedule-1",
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
			},
			null,
			2,
		)}\n`;
		fs.writeFileSync(configPath, content);
		const errors = [];

		expect(
			await ensurePaseoSchedulesConfig({
				home,
				interactive: false,
				logger: { error: (message) => errors.push(message) },
			}),
		).toBe(false);
		expect(fs.readFileSync(configPath, "utf8")).toBe(content);
		expect(errors[0]).toContain("duplicate schedule ID schedule-1");
	});

	it("treats zero mappings as a successful no-op without a client", async () => {
		const { home } = fixture();
		await ensurePaseoSchedulesConfig({ home, interactive: false });

		const checked = await checkPaseoSchedules({ home });
		const applied = await applyPaseoSchedules({ home });

		expect(checked.ok).toBe(true);
		expect(checked.targets.map(({ status }) => status)).toEqual([
			"skipped",
			"skipped",
			"skipped",
		]);
		expect(applied.ok).toBe(true);
		expect(applied.applied).toEqual([]);
		expect(applied.backupPath).toBeNull();
	});

	it("loads capabilities and inspects schedules only for mapped roles", async () => {
		const { configPath, home } = fixture();
		await ensurePaseoSchedulesConfig({ home, interactive: false });
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		config.roles.staleArchive.scheduleId = "schedule-archive";
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		const schedules = new Map([
			[
				"schedule-archive",
				storedSchedule("schedule-archive", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		const listProviderModels = client.listProviderModels;
		client.listProviderModels = async (provider) => {
			if (provider !== "claude") throw new Error(`unexpected ${provider}`);
			return listProviderModels(provider);
		};

		const result = await checkPaseoSchedules({ home, client });

		expect(result.ok).toBe(true);
		expect(
			result.targets.map(({ roleId, status }) => [roleId, status]),
		).toEqual([
			["staleArchive", "unchanged"],
			["worktreeCleaner", "skipped"],
			["mergeReadiness", "skipped"],
		]);
	});

	it("previews every explicit target and supported owned-field difference read-only", async () => {
		const { home } = await mappedFixture();
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			["schedule-cleaner", storedSchedule("schedule-cleaner")],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const before = structuredClone([...schedules]);

		const result = await checkPaseoSchedules({
			home,
			client: capabilityClient(schedules),
		});

		expect(result.ok).toBe(true);
		expect(
			result.targets.map(({ roleId, status }) => [roleId, status]),
		).toEqual([
			["staleArchive", "change"],
			["worktreeCleaner", "change"],
			["mergeReadiness", "unchanged"],
		]);
		expect(result.targets[0].changes).toEqual({
			model: { from: "claude-opus-5", to: "claude-sonnet-5" },
			thinkingOptionId: { from: "medium", to: "high" },
		});
		expect([...schedules]).toEqual(before);
	});

	it("refuses missing and non-new-agent configured targets", async () => {
		const { home } = await mappedFixture();
		const schedules = new Map([
			[
				"schedule-archive",
				{
					...storedSchedule("schedule-archive"),
					target: { type: "agent", agentId: crypto.randomUUID() },
				},
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);

		const result = await checkPaseoSchedules({
			home,
			client: capabilityClient(schedules),
		});

		expect(result.ok).toBe(false);
		expect(result.targets[0].errors).toContain(
			"schedule-archive is not a new-agent schedule",
		);
		expect(result.targets[1].errors[0]).toContain(
			"could not inspect schedule-cleaner",
		);
	});

	it("refuses unsupported provider, model, effort, and mode settings", async () => {
		const { configPath, home } = await mappedFixture();
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		config.roles.staleArchive = {
			...config.roles.staleArchive,
			provider: "unknown-provider",
			model: "unknown-model",
			thinkingOptionId: "ultra",
			modeId: "unknown-mode",
		};
		config.roles.worktreeCleaner.thinkingOptionId = "ultra";
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			[
				"schedule-cleaner",
				storedSchedule("schedule-cleaner", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);

		const result = await checkPaseoSchedules({
			home,
			client: capabilityClient(schedules),
		});
		const errors = result.targets.flatMap(({ errors }) => errors).join("\n");

		expect(result.ok).toBe(false);
		expect(errors).toContain("provider unknown-provider is not ready");
		expect(errors).toContain("model unknown-model is not supported");
		expect(errors).toContain("effort ultra is not supported");
		expect(errors).toContain("mode unknown-mode is not supported");
	});

	it("accepts the provider default as the preserved effective mode", async () => {
		const { configPath, home } = fixture();
		await ensurePaseoSchedulesConfig({ home, interactive: false });
		const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
		config.roles.staleArchive.scheduleId = "schedule-archive";
		fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
		const schedule = storedSchedule("schedule-archive", {
			model: "claude-sonnet-5",
			thinkingOptionId: "high",
		});
		delete schedule.target.config.modeId;
		const client = capabilityClient(new Map([["schedule-archive", schedule]]));
		client.getProvidersSnapshot = async () => ({
			entries: [
				{
					provider: "claude",
					enabled: true,
					status: "ready",
					defaultModeId: "bypassPermissions",
				},
			],
		});

		const result = await checkPaseoSchedules({ home, client });

		expect(result.ok).toBe(true);
		expect(result.targets[0].capabilities.modeId).toBe("bypassPermissions");
		expect(result.targets[0].status).toBe("unchanged");
	});

	it("does not back up or update when apply finds no owned-field differences", async () => {
		const { home } = await mappedFixture();
		const backupDirectory = path.join(home, "backups");
		const schedules = new Map([
			[
				"schedule-archive",
				storedSchedule("schedule-archive", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-cleaner",
				storedSchedule("schedule-cleaner", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		client.scheduleUpdate = async () => {
			throw new Error("no-op apply attempted a write");
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory,
			client,
		});

		expect(result.ok).toBe(true);
		expect(result.applied).toEqual([]);
		expect(result.backupPath).toBeNull();
		expect(fs.existsSync(backupDirectory)).toBe(false);
	});

	it("backs up all originals before updating only diffs and preserves protected fields", async () => {
		const { home } = await mappedFixture();
		const backupDirectory = path.join(home, "backups");
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			["schedule-cleaner", storedSchedule("schedule-cleaner")],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const originals = new Map(
			[...schedules].map(([id, schedule]) => [id, structuredClone(schedule)]),
		);
		const updates = [];
		const client = capabilityClient(schedules);
		client.scheduleUpdate = async ({ id, newAgentConfig }) => {
			const backups = fs.readdirSync(backupDirectory);
			expect(backups).toHaveLength(1);
			const backup = JSON.parse(
				fs.readFileSync(path.join(backupDirectory, backups[0]), "utf8"),
			);
			expect(backup.schedules.map(({ id }) => id)).toEqual([
				"schedule-archive",
				"schedule-cleaner",
				"schedule-merge",
			]);
			updates.push({ id, newAgentConfig });
			const current = schedules.get(id);
			current.target.config = {
				...current.target.config,
				...newAgentConfig,
			};
			return { schedule: structuredClone(current), error: null };
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory,
			client,
			now: () => new Date("2026-09-12T12:34:56.000Z"),
		});

		expect(result.ok).toBe(true);
		expect(result.applied).toEqual(["staleArchive", "worktreeCleaner"]);
		expect(updates).toEqual([
			{
				id: "schedule-archive",
				newAgentConfig: {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				},
			},
			{
				id: "schedule-cleaner",
				newAgentConfig: {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				},
			},
		]);
		expect(fs.statSync(result.backupPath).mode & 0o777).toBe(0o600);
		for (const id of ["schedule-archive", "schedule-cleaner"]) {
			const original = originals.get(id);
			const updated = schedules.get(id);
			expect({ ...updated, target: undefined }).toEqual({
				...original,
				target: undefined,
			});
			expect({
				...updated.target.config,
				model: undefined,
				thinkingOptionId: undefined,
			}).toEqual({
				...original.target.config,
				model: undefined,
				thinkingOptionId: undefined,
			});
		}
	});

	it("reports the first attempted write as uncertain when readback fails", async () => {
		const { home } = await mappedFixture();
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			[
				"schedule-cleaner",
				storedSchedule("schedule-cleaner", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		let archiveInspections = 0;
		const inspect = client.scheduleInspect;
		client.scheduleInspect = async ({ id }) => {
			if (id === "schedule-archive" && ++archiveInspections === 3) {
				throw new Error("connection lost after write");
			}
			return inspect({ id });
		};
		client.scheduleUpdate = async ({ id, newAgentConfig }) => {
			Object.assign(schedules.get(id).target.config, newAgentConfig);
			return { schedule: structuredClone(schedules.get(id)), error: null };
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory: path.join(home, "backups"),
			client,
		});

		expect(result.ok).toBe(false);
		expect(result.applied).toEqual([]);
		expect(result.attempted).toEqual(["staleArchive"]);
		expect(result.uncertain).toEqual(["staleArchive"]);
		expect(result.error).toContain("inspect schedule-archive before retrying");
		expect(result.error).toContain("No automatic retry was attempted");
		expect(fs.existsSync(result.backupPath)).toBe(true);
	});

	it("stops after a later write error with verified and uncertain receipts", async () => {
		const { home } = await mappedFixture();
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			["schedule-cleaner", storedSchedule("schedule-cleaner")],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		client.scheduleUpdate = async ({ id, newAgentConfig }) => {
			if (id === "schedule-cleaner") throw new Error("provider unavailable");
			Object.assign(schedules.get(id).target.config, newAgentConfig);
			return { schedule: structuredClone(schedules.get(id)), error: null };
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory: path.join(home, "backups"),
			client,
		});

		expect(result.ok).toBe(false);
		expect(result.partial).toBe(true);
		expect(result.applied).toEqual(["staleArchive"]);
		expect(result.attempted).toEqual(["staleArchive", "worktreeCleaner"]);
		expect(result.uncertain).toEqual(["worktreeCleaner"]);
		expect(result.error).toContain("provider unavailable");
		expect(fs.existsSync(result.backupPath)).toBe(true);
	});

	it("stops before writing when a schedule changes after preview", async () => {
		const { home } = await mappedFixture();
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			[
				"schedule-cleaner",
				storedSchedule("schedule-cleaner", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		const inspect = client.scheduleInspect;
		let archiveInspections = 0;
		client.scheduleInspect = async ({ id }) => {
			const result = await inspect({ id });
			if (id === "schedule-archive" && ++archiveInspections === 2) {
				result.schedule.prompt = "concurrently changed prompt";
			}
			return result;
		};
		let writes = 0;
		client.scheduleUpdate = async () => {
			writes += 1;
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory: path.join(home, "backups"),
			client,
		});

		expect(result.ok).toBe(false);
		expect(result.attempted).toEqual([]);
		expect(result.uncertain).toEqual([]);
		expect(result.error).toContain("changed after preview");
		expect(writes).toBe(0);
	});

	it("fails before API writes when exclusive backup publication collides", async () => {
		const { home } = await mappedFixture();
		const backupDirectory = path.join(home, "backups");
		fs.mkdirSync(backupDirectory, { recursive: true });
		const timestamp = "2026-09-12T12:34:56.000Z";
		const backupPath = path.join(
			backupDirectory,
			"paseo-schedules-2026-09-12T12-34-56.000Z-collision.json",
		);
		fs.writeFileSync(backupPath, "existing rollback evidence\n", {
			mode: 0o600,
		});
		const schedules = new Map([
			["schedule-archive", storedSchedule("schedule-archive")],
			[
				"schedule-cleaner",
				storedSchedule("schedule-cleaner", {
					model: "claude-sonnet-5",
					thinkingOptionId: "high",
				}),
			],
			[
				"schedule-merge",
				storedSchedule("schedule-merge", {
					provider: "codex",
					model: "gpt-5.6-luna",
					modeId: "full-access",
					thinkingOptionId: "high",
				}),
			],
		]);
		const client = capabilityClient(schedules);
		let writes = 0;
		client.scheduleUpdate = async () => {
			writes += 1;
			throw new Error("must not write");
		};

		const result = await applyPaseoSchedules({
			home,
			backupDirectory,
			client,
			now: () => new Date(timestamp),
			randomSuffix: () => "collision",
		});

		expect(result.ok).toBe(false);
		expect(result.backupPath).toBeNull();
		expect(result.attempted).toEqual([]);
		expect(writes).toBe(0);
		expect(fs.readFileSync(backupPath, "utf8")).toBe(
			"existing rollback evidence\n",
		);
	});
});
