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

const glmProfiles = [
	{
		id: "docs-glm",
		name: "docs-glm",
		provider: "opencode",
		model: "opencode-go/glm-5.3-flash",
		modeId: "build",
		thinkingOptionId: "high",
	},
	{
		id: "pr-requirements-glm",
		name: "pr-requirements-glm",
		provider: "opencode",
		model: "opencode-go/glm-5.3-flash",
		modeId: "plan",
		thinkingOptionId: "high",
	},
	{
		id: "pr-monitor-glm",
		name: "pr-monitor-glm",
		provider: "opencode",
		model: "opencode-go/glm-5.3-flash",
		modeId: "build",
		thinkingOptionId: "low",
	},
];

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

	it("replaces retired managed profiles without disturbing unrelated live state", () => {
		const upgradedPolicy = {
			...policy,
			agentProfiles: [...policy.agentProfiles, ...glmProfiles],
		};
		const live = {
			version: 7,
			daemon: {
				auth: { password: "bcrypt" },
				relay: { enabled: true, token: "keep" },
				listen: "127.0.0.1:7777",
				state: { currentAgentId: "keep-running" },
				agentProfiles: [
					{ id: "docs-muse", model: "retired-customized" },
					{ id: "pr-requirements-muse", model: "retired" },
					{ id: "pr-monitor-muse", model: "retired" },
					{ id: "personal", provider: "opencode", model: "keep" },
				],
			},
			agents: {
				providers: {
					opencode: { env: { OPENCODE_API_KEY: "keep" } },
					private: { command: ["keep-provider"] },
				},
			},
			app: { baseUrl: "https://private.example" },
		};

		const merged = mergePaseoPolicy(live, upgradedPolicy);

		expect(mergePaseoPolicy(merged, upgradedPolicy)).toEqual(merged);
		expect(merged.version).toBe(7);
		expect(merged.daemon).toMatchObject({
			auth: live.daemon.auth,
			relay: live.daemon.relay,
			listen: live.daemon.listen,
			state: live.daemon.state,
		});
		expect(merged.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			...glmProfiles,
			{ id: "personal", provider: "opencode", model: "keep" },
		]);
		expect(merged.agents.providers.opencode).toEqual(
			live.agents.providers.opencode,
		);
		expect(merged.agents.providers.private).toEqual(
			live.agents.providers.private,
		);
		expect(merged.app).toEqual(live.app);
	});

	it("removes a retired profile only when its replacement is managed", () => {
		const retired = [
			{ id: "docs-muse", model: "keep-until-replacement" },
			{ id: "pr-requirements-muse", model: "keep-until-replacement" },
			{ id: "pr-monitor-muse", model: "retire" },
		];
		const merged = mergePaseoPolicy(
			{ daemon: { agentProfiles: retired } },
			{ ...policy, agentProfiles: [...policy.agentProfiles, glmProfiles[2]] },
		);

		expect(merged.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			glmProfiles[2],
			retired[0],
			retired[1],
		]);
	});

	it("ships the GLM documentation and PR workflow routes", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const bundledPolicy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const routed = bundledPolicy.agentProfiles
			.filter(({ id }) => glmProfiles.some((profile) => profile.id === id))
			.map(({ notes: _notes, ...profile }) => profile);

		expect(routed).toEqual(glmProfiles);
		expect(
			bundledPolicy.agentProfiles.map(({ id }) => id),
		).not.toContainAnyValues([
			"docs-muse",
			"pr-requirements-muse",
			"pr-monitor-muse",
		]);

		const skillExpectations = {
			"model-routing/SKILL.md": ["docs-glm", "GLM monitors"],
			"model-routing/references/briefings.md": ["docs-glm"],
			"model-routing/references/matt-workflows.md": ["docs-glm"],
			"paseo-pr-babysit/SKILL.md": ["pr-monitor-glm"],
			"paseo-pr-review/SKILL.md": ["pr-requirements-glm"],
		};
		for (const [relativePath, expected] of Object.entries(skillExpectations)) {
			const contents = fs.readFileSync(
				path.join(projectRoot, "configs", "agent-skills", relativePath),
				"utf8",
			);
			for (const value of expected) expect(contents).toContain(value);
		}
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
