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

const recurringGrokProfiles = [
	{
		id: "pr-monitor-glm",
		name: "PR Monitor",
		provider: "grok",
		model: "grok-4.6",
	},
	{
		id: "watchdog-grok",
		name: "Monitor Watchdog",
		provider: "grok",
		model: "grok-4.6",
	},
];

const legacyWorkflowProfiles = [
	{
		id: "docs-glm",
		name: "Documentation",
		provider: "claude",
		model: "claude-opus-5",
		modeId: "bypassPermissions",
		thinkingOptionId: "medium",
	},
	{
		id: "pr-requirements-glm",
		name: "PR Requirements Review",
		provider: "claude",
		model: "claude-opus-5",
		modeId: "plan",
		thinkingOptionId: "medium",
	},
	recurringGrokProfiles[0],
];

const opusReplacementProfiles = [
	{
		id: "research-opus",
		name: "Requirements Research",
		provider: "claude",
		model: "claude-opus-5",
		modeId: "bypassPermissions",
		thinkingOptionId: "high",
	},
	{
		id: "explainer-opus",
		name: "Visual Explainer",
		provider: "claude",
		model: "claude-opus-5",
		modeId: "bypassPermissions",
		thinkingOptionId: "medium",
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

	it("preserves live role-ID and custom profiles when applying the bundled policy", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const bundledPolicy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const liveProfiles = [
			{
				id: "planning-advisor",
				name: "Live Planning Advisor",
				provider: "claude",
				model: "live-fable",
				credentials: { token: "keep-planning-secret" },
			},
			{
				id: "implement-code",
				name: "Live Implementation",
				provider: "codex",
				model: "live-sol",
				env: { IMPLEMENT_TOKEN: "keep-implementation-secret" },
			},
			{
				id: "review-code",
				name: "Live Review",
				provider: "claude",
				model: "live-opus",
				notes: "keep live review differences",
			},
			{
				id: "custom-role",
				name: "Custom Role",
				provider: "private",
				model: "custom-model",
				secret: "keep-custom-secret",
			},
		];
		const live = {
			version: 7,
			daemon: {
				auth: { password: "keep-auth-secret" },
				agentProfiles: liveProfiles,
			},
			agents: {
				providers: {
					codex: { env: { CODEX_TOKEN: "keep-provider-secret" } },
				},
			},
		};

		const merged = mergePaseoPolicy(live, bundledPolicy);

		expect(merged.daemon.agentProfiles.slice(-liveProfiles.length)).toEqual(
			liveProfiles,
		);
		expect(merged.daemon.auth).toEqual(live.daemon.auth);
		expect(merged.agents.providers.codex).toEqual(live.agents.providers.codex);
		expect(mergePaseoPolicy(merged, bundledPolicy)).toEqual(merged);
	});

	it("replaces retired managed profiles without disturbing unrelated live state", () => {
		const upgradedPolicy = {
			...policy,
			agentProfiles: [...policy.agentProfiles, ...legacyWorkflowProfiles],
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
			...legacyWorkflowProfiles,
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
			{
				...policy,
				agentProfiles: [...policy.agentProfiles, legacyWorkflowProfiles[2]],
			},
		);

		expect(merged.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			legacyWorkflowProfiles[2],
			retired[0],
			retired[1],
		]);
	});

	it("retires legacy research and presentation profiles only with their replacements", () => {
		const legacyResearch = {
			id: "research-sonnet",
			model: "keep-until-replacement",
		};
		const legacyPresentation = {
			id: "explainer-sonnet",
			model: "keep-until-replacement",
		};
		const custom = { id: "research-custom", model: "keep" };
		const live = {
			version: 9,
			daemon: {
				auth: { password: "keep" },
				state: { currentAgentId: "keep" },
				agentProfiles: [legacyResearch, legacyPresentation, custom],
			},
			agents: {
				providers: { claude: { env: { API_TOKEN: "keep" } } },
			},
		};
		const researchOnlyPolicy = {
			...policy,
			agentProfiles: [...policy.agentProfiles, opusReplacementProfiles[0]],
		};

		const researchOnly = mergePaseoPolicy(live, researchOnlyPolicy);

		expect(researchOnly.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			opusReplacementProfiles[0],
			legacyPresentation,
			custom,
		]);
		expect(researchOnly.daemon.auth).toEqual(live.daemon.auth);
		expect(researchOnly.daemon.state).toEqual(live.daemon.state);
		expect(researchOnly.agents.providers.claude).toEqual(
			live.agents.providers.claude,
		);
		const presentationOnly = mergePaseoPolicy(live, {
			...policy,
			agentProfiles: [...policy.agentProfiles, opusReplacementProfiles[1]],
		});
		expect(presentationOnly.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			opusReplacementProfiles[1],
			legacyResearch,
			custom,
		]);

		const completePolicy = {
			...researchOnlyPolicy,
			agentProfiles: [
				...researchOnlyPolicy.agentProfiles,
				opusReplacementProfiles[1],
			],
		};
		const complete = mergePaseoPolicy(researchOnly, completePolicy);

		expect(complete.daemon.agentProfiles).toEqual([
			policy.agentProfiles[0],
			...opusReplacementProfiles,
			custom,
		]);
		expect(mergePaseoPolicy(complete, completePolicy)).toEqual(complete);
	});

	it("ships Opus routes and provider-native Grok recurring profiles", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const bundledPolicy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const profiles = new Map(
			bundledPolicy.agentProfiles.map((profile) => [profile.id, profile]),
		);

		for (const expected of opusReplacementProfiles) {
			const { notes: _notes, ...actual } = profiles.get(expected.id) ?? {};
			expect(actual).toEqual(expected);
		}
		for (const id of [
			"docs-glm",
			"pr-correctness-grok",
			"pr-requirements-glm",
		]) {
			expect(profiles.get(id)).toMatchObject({
				provider: "claude",
				model: "claude-opus-5",
				thinkingOptionId: "medium",
			});
		}
		for (const expected of recurringGrokProfiles) {
			const { notes: _notes, ...actual } = profiles.get(expected.id) ?? {};
			expect(actual).toEqual(expected);
			expect(actual).not.toHaveProperty("modeId");
			expect(actual).not.toHaveProperty("thinkingOptionId");
		}
		expect(
			bundledPolicy.agentProfiles.some(
				({ provider }) => provider === "opencode",
			),
		).toBe(false);
		expect(profiles.get("pr-correctness-grok")?.modeId).toBe("plan");
		expect(profiles.has("research-sonnet")).toBe(false);
		expect(profiles.has("explainer-sonnet")).toBe(false);
		expect(profiles.get("research-sol-medium")?.thinkingOptionId).toBe(
			"medium",
		);
		expect(profiles.get("explainer-content-sol")?.thinkingOptionId).toBe(
			"medium",
		);
		expect(profiles.get("explore-sonnet")?.thinkingOptionId).toBe("xhigh");
		expect(profiles.get("explainer-content-opus")?.thinkingOptionId).toBe(
			"high",
		);
		expect(profiles.get("explainer-review-terra")?.thinkingOptionId).toBe(
			"high",
		);
		expect(profiles.get("docs-glm")?.notes).toContain(
			"Ordinary prose stays prose",
		);
		expect(profiles.get("docs-glm")?.notes).toContain("visual-explainer");
		expect(profiles.get("explainer-opus")?.notes).toContain(
			"~/.config/haoshoku/visual-explainer.json",
		);
		expect(profiles.get("explainer-opus")?.notes).toContain(
			"fixed dark or light",
		);
		expect(profiles.get("explainer-opus")?.notes).toContain(
			"explicit per-request theme overrides",
		);
		expect(profiles.get("explainer-review-terra")?.notes).toContain(
			"source accuracy",
		);
		expect(profiles.get("explainer-content-sol")?.notes).toContain(
			"only when assigned",
		);

		for (const profile of bundledPolicy.agentProfiles) {
			if (
				profile.model === "claude-opus-5" &&
				![
					"explainer-opus",
					"docs-glm",
					"pr-correctness-grok",
					"pr-requirements-glm",
				].includes(profile.id)
			) {
				expect(profile.thinkingOptionId, profile.id).toBe("high");
			}
		}
	});

	it("ships driver-neutral Fable and Astra advisor routing", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const skillRoot = path.join(projectRoot, "configs", "agent-skills");
		const bundledPolicy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const fable = bundledPolicy.agentProfiles.find(
			({ id }) => id === "fable-planner",
		);
		const technicalAdvisor = bundledPolicy.agentProfiles.find(
			({ id }) => id === "technical-advisor",
		);
		const { notes: technicalAdvisorNotes, ...technicalAdvisorRuntime } =
			technicalAdvisor ?? {};
		const routingSkill = fs.readFileSync(
			path.join(skillRoot, "model-routing", "SKILL.md"),
			"utf8",
		);
		const briefings = fs.readFileSync(
			path.join(skillRoot, "model-routing", "references", "briefings.md"),
			"utf8",
		);
		const mattWorkflows = fs.readFileSync(
			path.join(skillRoot, "model-routing", "references", "matt-workflows.md"),
			"utf8",
		);
		const portablePolicies = ["codex/AGENTS.md", "claude/CLAUDE.md"].map(
			(relativePath) =>
				fs.readFileSync(
					path.join(projectRoot, "configs", relativePath),
					"utf8",
				),
		);

		expect(fable).toMatchObject({
			model: "claude-fable-5-1",
			thinkingOptionId: "high",
		});
		expect(fable?.notes).toContain("planning partner for the driver");
		expect(fable?.notes).toContain("AGREE, DISAGREE, or INSUFFICIENT EVIDENCE");
		expect(fable?.notes).toContain("with evidence pointers");
		expect(fable?.notes).toContain("Do not review the whole candidate");
		expect(fable?.notes).toContain("Keep product files unchanged");
		expect(technicalAdvisorRuntime).toEqual({
			id: "technical-advisor",
			name: "Technical Advisor",
			provider: "codex",
			model: "gpt-6-astra",
			modeId: "full-access",
			thinkingOptionId: "high",
		});
		expect(technicalAdvisorNotes).toContain("scoped recommendation");
		expect(technicalAdvisorNotes).toContain("risks, alternatives");
		expect(technicalAdvisorNotes).toContain("acceptance checks");
		expect(technicalAdvisorNotes).toContain("Do not review or implement");
		expect(
			bundledPolicy.agentProfiles.filter(({ id, name }) =>
				/driver/i.test(`${id} ${name}`),
			),
		).toEqual([]);
		expect(routingSkill).toContain(
			"The main conversation is the driver, using its selected model",
		);

		// Policy: substantial planning and consequential design have distinct triggers.
		expect(routingSkill).toMatch(
			/Before substantial planning[\s\S]+`fable-planner`/,
		);
		expect(routingSkill).toMatch(
			/Before consequential technical design[\s\S]+`technical-advisor`/,
		);
		expect(routingSkill).toContain(
			"When both triggers apply, use both checkpoints",
		);
		expect(routingSkill).toContain("not an unconditional mirrored dispatch");
		// Contract: an Astra driver may self-record unless independence is explicit.
		expect(routingSkill).toContain(
			"An Astra driver may record its own Astra assessment",
		);
		expect(routingSkill).toContain("explicit independent Astra seat");
		// Policy: a superficial checklist does not make routine work substantial.
		expect(routingSkill).toContain("Routine known work stays direct");
		expect(routingSkill).toContain("superficial checklist");
		expect(routingSkill).toContain("Do not invoke both advisors automatically");
		expect(routingSkill).toContain(
			"If required Fable planning is unavailable, stop only the dependent planning decision",
		);
		expect(routingSkill).toContain(
			"If required Astra advice is unavailable, stop only the dependent technical decision",
		);

		for (const category of [
			"security or trust boundaries",
			"irreversible data or infrastructure changes",
			"significant financial or loss risk",
			"material architecture commitments",
		]) {
			expect(routingSkill).toContain(category);
		}
		expect(routingSkill).toContain("Astra and Fable both record plain AGREE");
		expect(routingSkill).toContain("Obtain Astra's position first");
		expect(routingSkill).toContain("already explicitly authorized");
		expect(routingSkill).toContain("material deviation");
		expect(routingSkill).toContain("do not reopen an accepted decision");
		expect(routingSkill).toContain("two focused evidence rounds");
		expect(routingSkill).toContain(
			"If either required advisor is unavailable, stop only the dependent decision",
		);
		expect(routingSkill).toContain(
			"`paseo-advisor` and `paseo-committee` are not substitutes",
		);
		expect(routingSkill).toContain("no silent override");
		expect(routingSkill).toContain("Opus approval");
		expect(routingSkill).toContain("not approval of a candidate");
		expect(routingSkill).toContain(
			"consensus decisions with category, both verdicts, evidence pointers, and revision or evidence-set identity",
		);

		for (const requirement of [
			"Astra's position before reading Fable's",
			"selected model",
			"technical-advisor",
			"recommendation, risks, alternatives, and acceptance checks",
			"independently verifies at least one material claim",
			"strongest concrete counterargument",
			"`AGREE`, `DISAGREE`, or `INSUFFICIENT EVIDENCE`",
			"question, both positions, evidence pointers, resolving fact, and recommended default",
			"rejected classification",
			"revision or evidence set",
		]) {
			expect(briefings).toContain(requirement);
		}
		expect(mattWorkflows).toContain("satisfies the consensus gate once");
		expect(mattWorkflows).toContain("selected model remains the driver");
		expect(mattWorkflows).not.toContain("intended to run on Astra");
		for (const portablePolicy of portablePolicies) {
			expect(portablePolicy).toMatch(
				/main conversation's selected\s+model is the driver/,
			);
		}
	});

	it("requires an explicit Astra verdict for assigned high-stakes decisions", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const policy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const technicalAdvisor = policy.agentProfiles.find(
			({ id }) => id === "technical-advisor",
		);
		const briefings = fs.readFileSync(
			path.join(
				projectRoot,
				"configs",
				"agent-skills",
				"model-routing",
				"references",
				"briefings.md",
			),
			"utf8",
		);

		expect(technicalAdvisor?.notes).toContain(
			"For an assigned high-stakes decision",
		);
		expect(technicalAdvisor?.notes).toContain(
			"plain AGREE, DISAGREE, or INSUFFICIENT EVIDENCE",
		);
		expect(briefings).toContain("Astra independently verifies");
		expect(briefings).toContain(
			"returns exactly `AGREE`, `DISAGREE`, or `INSUFFICIENT EVIDENCE`",
		);
		expect(briefings).toContain("recorded Astra-driver assessment");
		expect(technicalAdvisor?.notes).toContain("Ordinary advice is not a veto");
	});

	it("routes requested visual artifacts without forcing ordinary prose to HTML", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const skillRoot = path.join(projectRoot, "configs", "agent-skills");
		const files = [
			"model-routing/SKILL.md",
			"model-routing/references/matt-workflows.md",
			"model-routing/references/briefings.md",
		];
		const contents = files.map((relativePath) =>
			fs.readFileSync(path.join(skillRoot, relativePath), "utf8"),
		);

		expect(contents[0]).toContain("`research-opus`");
		expect(contents[1]).toContain("`research-opus`");
		expect(contents[0]).toContain("visual-explainer");
		expect(contents[0]).toContain("Ordinary prose remains prose");
		expect(contents[2]).toContain("visual-explainer.json");
		expect(contents[2]).toContain("fixed `dark` or `light`");
		expect(contents[2]).toContain("regardless of the OS preference");
		expect(contents[2]).toContain(
			"remove or override any `prefers-color-scheme`",
		);
		expect(contents[2]).toContain(
			"For `system`, retain responsive theme media queries",
		);
		for (const content of contents) {
			expect(content).not.toContain("html-deliverables");
			expect(content).not.toContain("exact approved Markdown");
			expect(content).not.toContain("research-sonnet");
			expect(content).not.toContain("explainer-sonnet");
		}
	});

	it("ships stable documentation and PR workflow profile IDs", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const bundledPolicy = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "paseo", "agent-profiles.json"),
				"utf8",
			),
		);
		const routed = bundledPolicy.agentProfiles
			.filter(({ id }) =>
				legacyWorkflowProfiles.some((profile) => profile.id === id),
			)
			.map(({ notes: _notes, ...profile }) => profile);

		expect(routed).toEqual(legacyWorkflowProfiles);
		expect(
			bundledPolicy.agentProfiles.map(({ id }) => id),
		).not.toContainAnyValues([
			"docs-muse",
			"pr-requirements-muse",
			"pr-monitor-muse",
		]);

		const skillExpectations = {
			"model-routing/SKILL.md": [
				"docs-glm",
				"recurring watchers and watchdogs",
			],
			"model-routing/references/briefings.md": ["docs-glm"],
			"model-routing/references/matt-workflows.md": ["docs-glm"],
			"paseo-pr-babysit/SKILL.md": ["pr-monitor-glm", "watchdog-grok"],
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

	it("keeps recurring heartbeats session-owned and healthy ticks driver-quiet", () => {
		const projectRoot = path.resolve(import.meta.dir, "..");
		const skill = fs.readFileSync(
			path.join(
				projectRoot,
				"configs",
				"agent-skills",
				"paseo-pr-babysit",
				"SKILL.md",
			),
			"utf8",
		);

		for (const contract of [
			"separate Grok monitor and watchdog sessions",
			"Each session creates and owns its own heartbeat",
			'`*/5 * * * *` with `expiresIn: "24h"`',
			'`0 * * * *` with `expiresIn: "48h"`',
			"checks only the monitor snapshot timestamp, session and heartbeat health",
			"Routine healthy ticks update only the watchdog snapshot and do not message or wake the driver",
			"The monitor never renews without that acknowledgement",
		]) {
			expect(skill).toContain(contract);
		}
		expect(skill).not.toContain("driver-owned hourly watchdog");
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
