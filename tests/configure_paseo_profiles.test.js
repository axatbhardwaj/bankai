import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	backupPaseoProfiles,
	extractPaseoPolicy,
	mergePaseoPolicy,
	syncPaseoProfiles,
} from "../src/helpers/configure_paseo_profiles.js";

const roots = [];
const policy = {
	version: 1,
	agentProfiles: [
		{
			id: "review-opus",
			name: "review-opus",
			provider: "claude",
			model: "opus",
			modeId: "safe",
			thinkingOptionId: "high",
			notes: "Review the exact candidate.",
		},
	],
	providers: {
		grok: { extends: "acp", command: ["grok", "agent", "stdio"] },
		copilot: { enabled: false },
	},
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-paseo-policy-"));
	roots.push(root);
	const home = path.join(root, "home");
	const projectRoot = path.join(root, "project");
	const policyPath = path.join(
		projectRoot,
		"configs",
		"paseo",
		"agent-profiles.json",
	);
	fs.mkdirSync(path.dirname(policyPath), { recursive: true });
	fs.writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`);
	return {
		configPath: path.join(home, ".paseo", "config.json"),
		home,
		policyPath,
		projectRoot,
	};
}

const logger = (warnings = [], info = []) => ({
	error: (value) => warnings.push(value),
	info: (value) => info.push(value),
	success() {},
	warning: (value) => warnings.push(value),
});

describe("Paseo orchestration policy", () => {
	it("extracts only profile and provider whitelist fields", () => {
		const extracted = extractPaseoPolicy({
			daemon: {
				auth: { password: "secret" },
				relay: { token: "secret" },
				agentProfiles: [{ ...policy.agentProfiles[0], secret: "drop" }],
			},
			agents: {
				providers: {
					grok: { ...policy.providers.grok, env: { KEY: "secret" } },
				},
			},
			app: { baseUrl: "private" },
		});

		expect(extracted).toEqual({
			version: 1,
			agentProfiles: policy.agentProfiles,
			providers: { grok: policy.providers.grok },
		});
		expect(JSON.stringify(extracted)).not.toContain("secret");
	});

	it("merges managed ids while preserving unknown state and provider secrets", () => {
		const live = {
			version: 1,
			daemon: {
				auth: { password: "bcrypt" },
				relay: { enabled: true },
				listen: "127.0.0.1:7777",
				cors: ["private"],
				agentProfiles: [
					{ id: "review-opus", model: "old" },
					{ id: "personal", model: "keep" },
				],
			},
			agents: {
				providers: {
					grok: { env: { GROK_TOKEN: "keep" }, command: ["old"] },
				},
			},
		};
		const original = structuredClone(live);

		const merged = mergePaseoPolicy(live, policy);

		expect(live).toEqual(original);
		expect(merged.daemon.auth).toEqual(live.daemon.auth);
		expect(merged.daemon.relay).toEqual(live.daemon.relay);
		expect(merged.daemon.listen).toBe(live.daemon.listen);
		expect(merged.daemon.cors).toEqual(live.daemon.cors);
		expect(merged.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			{ id: "personal", model: "keep" },
		]);
		expect(merged.agents.providers.grok).toEqual({
			env: { GROK_TOKEN: "keep" },
			...policy.providers.grok,
		});
	});

	it("writes a minimal fresh config without invoking Paseo", async () => {
		const { configPath, home, projectRoot } = fixture();
		const calls = [];

		expect(
			await syncPaseoProfiles({
				home,
				projectRoot,
				runProcessImpl: async (args) => calls.push(args),
			}),
		).toBe(true);
		expect(calls).toEqual([]);
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			version: 1,
			daemon: { agentProfiles: policy.agentProfiles },
			agents: { providers: policy.providers },
		});
	});

	it("refuses a missing config with an ambiguous PID before any CLI call", async () => {
		const { configPath, home, projectRoot } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(path.join(path.dirname(configPath), "paseo.pid"), "{}\n");
		const calls = [];

		expect(
			await syncPaseoProfiles({
				home,
				projectRoot,
				runProcessImpl: async (args) => calls.push(args),
			}),
		).toBe(false);
		expect(calls).toEqual([]);
		expect(fs.existsSync(configPath)).toBe(false);
	});

	it("does not overwrite malformed or concurrently-created config", async () => {
		const malformed = fixture();
		fs.mkdirSync(path.dirname(malformed.configPath), { recursive: true });
		fs.writeFileSync(malformed.configPath, "[]\n");
		expect(await syncPaseoProfiles(malformed)).toBe(false);
		expect(fs.readFileSync(malformed.configPath, "utf8")).toBe("[]\n");

		const raced = fixture();
		const competing = '{"version":1,"owner":"upstream"}\n';
		expect(
			await syncPaseoProfiles({
				...raced,
				safeCopyFileImpl: (_source, destination, options) => {
					fs.writeFileSync(destination, competing);
					options.beforeReplace();
				},
			}),
		).toBe(false);
		expect(fs.readFileSync(raced.configPath, "utf8")).toBe(competing);
	});

	it("reloads only the running daemon for the exact home and listen address", async () => {
		const { configPath, home, projectRoot } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{"version":1,"unknown":"keep"}\n');
		const calls = [];
		const warnings = [];
		const paseoHome = path.dirname(configPath);
		const runner = async (args, options) => {
			calls.push(args);
			expect(options.env.PASEO_HOME).toBeUndefined();
			expect(options.env.PASEO_HOST).toBeUndefined();
			if (args.includes("status")) {
				return {
					exitCode: 0,
					stdout: JSON.stringify({
						home: paseoHome,
						listen: "127.0.0.1:6767",
						localDaemon: "running",
					}),
				};
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify({ restartRequiredPaths: ["daemon.listen"] }),
			};
		};

		expect(
			await syncPaseoProfiles({
				home,
				logger: logger(warnings),
				projectRoot,
				runProcessImpl: runner,
				whichImpl: () => "/usr/bin/paseo",
				environment: { PASEO_HOME: "/wrong", PASEO_HOST: "ssh://wrong" },
			}),
		).toBe(true);
		expect(calls).toEqual([
			["/usr/bin/paseo", "daemon", "status", "--home", paseoHome, "--json"],
			["/usr/bin/paseo", "reload", "--host", "127.0.0.1:6767", "--json"],
		]);
		expect(warnings.join("\n")).toContain("daemon.listen");
	});

	it("skips reload for a stopped or different-home daemon", async () => {
		for (const status of [
			{ localDaemon: "stopped" },
			{
				home: "/another/home/.paseo",
				listen: "127.0.0.1:6767",
				localDaemon: "running",
			},
		]) {
			const { configPath, home, projectRoot } = fixture();
			fs.mkdirSync(path.dirname(configPath), { recursive: true });
			fs.writeFileSync(configPath, "{}\n");
			const calls = [];
			await syncPaseoProfiles({
				home,
				projectRoot,
				runProcessImpl: async (args) => {
					calls.push(args);
					return { exitCode: 0, stdout: JSON.stringify(status) };
				},
				whichImpl: () => "/usr/bin/paseo",
			});
			expect(calls).toHaveLength(1);
		}
	});

	it("backs up a secret-free policy without invoking Paseo", () => {
		const { configPath, home, policyPath, projectRoot } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(
			configPath,
			JSON.stringify({
				daemon: {
					auth: { password: "drop" },
					relay: { token: "drop" },
					agentProfiles: policy.agentProfiles,
				},
				agents: {
					providers: { grok: { ...policy.providers.grok, key: "drop" } },
				},
			}),
		);

		expect(backupPaseoProfiles({ home, projectRoot })).toBe(true);
		const backedUp = fs.readFileSync(policyPath, "utf8");
		expect(backedUp).not.toContain("password");
		expect(backedUp).not.toContain("relay");
		expect(backedUp).not.toContain("token");
		expect(JSON.parse(backedUp)).toEqual({
			version: 1,
			agentProfiles: policy.agentProfiles,
			providers: { grok: policy.providers.grok },
		});
	});
});
