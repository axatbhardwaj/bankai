import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { configureHermesRelay } from "../src/helpers/configure_hermes_relay.js";

const roots = [];
const PLUGIN_FILES = [
	"__init__.py",
	"adapters.py",
	"cli.py",
	"modes.py",
	"outbound.py",
	"relay.py",
	"runtime.py",
	"storage.py",
	"hermes-relay",
	"config.example.json",
	"README.md",
	"plugin.yaml",
];
const RELAY_COMMIT = "73846214657a165379a1698b6bccff6c9c9e484f";

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-hermes-relay-"));
	roots.push(root);
	const home = path.join(root, "home");
	const hermesHome = path.join(home, ".hermes");
	const projectRoot = path.join(root, "project");
	const source = path.join(projectRoot, "standalone-source");
	fs.mkdirSync(source, { recursive: true });
	for (const file of PLUGIN_FILES) {
		let content = `${file}\n`;
		if (file === "plugin.yaml") {
			content = "name: paseo-review-relay\nversion: 0.2.0\n";
		} else if (file === "config.example.json") {
			content = `${JSON.stringify(
				{
					telegramChatId: "YOUR_PRIVATE_DM_CHAT_ID",
					telegramUserId: "YOUR_PRIVATE_TELEGRAM_USER_ID",
					serverId: "YOUR_LOCAL_PASEO_SERVER_ID",
				},
				null,
				2,
			)}\n`;
		}
		fs.writeFileSync(path.join(source, file), content);
	}
	fs.chmodSync(path.join(source, "hermes-relay"), 0o755);
	const lockDirectory = path.join(projectRoot, "configs", "hermes-relay");
	fs.mkdirSync(lockDirectory, { recursive: true });
	fs.writeFileSync(
		path.join(lockDirectory, "lock.json"),
		`${JSON.stringify({
			version: 1,
			repository: "https://github.com/axatbhardwaj/paseo-hermes-relay.git",
			tag: "v0.2.0",
			commit: RELAY_COMMIT,
		})}\n`,
	);
	fs.writeFileSync(
		path.join(lockDirectory, "hermes-runtime.json"),
		`${JSON.stringify({
			version: 1,
			installer: "https://hermes-agent.nousresearch.com/install.sh",
			commit: "67764dc0863349a384c16425e73ee8571f3a94b7",
		})}\n`,
	);
	fs.mkdirSync(hermesHome, { recursive: true });
	fs.writeFileSync(
		path.join(hermesHome, "config.yaml"),
		"plugins:\n  enabled: []\n",
	);

	const calls = [];
	const runProcessImpl = async (argv) => {
		calls.push(argv);
		if (argv.at(-1) === "--version") {
			return { exitCode: 0, stdout: "Hermes Agent v0.21.1\n", stderr: "" };
		}
		if (argv.slice(1).join(" ") === "status --json") {
			return {
				exitCode: 0,
				stdout: JSON.stringify({
					serverId: "server-vps",
					localDaemon: "running",
					connectedDaemon: "reachable",
				}),
				stderr: "",
			};
		}
		if (argv[0] === "/usr/bin/git" && argv.includes("rev-parse")) {
			return { exitCode: 0, stdout: `${RELAY_COMMIT}\n`, stderr: "" };
		}
		throw new Error(`unexpected command: ${argv.join(" ")}`);
	};
	const messages = [];
	const logger = {
		dim() {},
		error: (message) => messages.push(message),
		info: (message) => messages.push(message),
		success: (message) => messages.push(message),
		warning: (message) => messages.push(message),
	};
	return {
		calls,
		hermesHome,
		home,
		logger,
		messages,
		projectRoot,
		readTelegramIdentityImpl: async () => null,
		telegramCredentialReadyImpl: async () => true,
		runProcessImpl,
		source,
		sourceDirectory: source,
		whichImpl: (command) =>
			({
				git: "/usr/bin/git",
				hermes: "/usr/local/bin/hermes",
				paseo: "/usr/bin/paseo",
			})[command] ?? null,
	};
}

function addSuccessfulHermesCommands(setup, { initiallyEnabled = false } = {}) {
	let enabled = initiallyEnabled;
	const baseRunner = setup.runProcessImpl;
	setup.runProcessImpl = async (argv, options) => {
		const command = argv.slice(1).join(" ");
		if (command === "plugins list --enabled --user --json") {
			setup.calls.push(argv);
			return {
				exitCode: 0,
				stdout: enabled
					? `${JSON.stringify([
							{
								name: "paseo-review-relay",
								status: "enabled",
								version: "0.1.0",
								description: "relay",
								source: "user",
								removed: null,
							},
						])}\n`
					: "[]\n",
				stderr: "",
			};
		}
		if (
			command === "plugins enable paseo-review-relay --no-allow-tool-override"
		) {
			setup.calls.push(argv);
			enabled = true;
			return { exitCode: 0, stdout: "enabled\n", stderr: "" };
		}
		if (argv[1] === "plugins" && argv[2] === "doctor") {
			setup.calls.push(argv);
			return { exitCode: 0, stdout: "doctor passed\n", stderr: "" };
		}
		if (argv[0].endsWith("hermes-relay") && argv[1] === "doctor") {
			setup.calls.push(argv);
			return { exitCode: 0, stdout: "relay ready\n", stderr: "" };
		}
		if (command === "gateway restart") {
			setup.calls.push(argv);
			return { exitCode: 0, stdout: "restarted\n", stderr: "" };
		}
		return baseRunner(argv, options);
	};
}

describe("configureHermesRelay", () => {
	it("returns incomplete when the Hermes process cannot spawn", async () => {
		const setup = fixture();
		delete setup.runProcessImpl;
		setup.whichImpl = (command) =>
			command === "hermes"
				? path.join(setup.home, "missing-hermes-executable")
				: null;

		expect(await configureHermesRelay(setup)).toBe(false);
		expect(setup.messages.join("\n")).toContain(
			"existing Hermes CLI is not usable",
		);
	});

	it("bootstraps missing Hermes at the validated commit without running setup", async () => {
		const setup = fixture();
		setup.hermesCandidates = [];
		let hermesLookups = 0;
		setup.whichImpl = (command) => {
			if (command === "hermes") {
				hermesLookups += 1;
				return hermesLookups === 1 ? null : "/usr/local/bin/hermes";
			}
			return (
				{
					bash: "/usr/bin/bash",
					curl: "/usr/bin/curl",
					paseo: "/usr/bin/paseo",
				}[command] ?? null
			);
		};
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			setup.calls.push(argv);
			if (argv[0] === "/usr/bin/curl") {
				fs.writeFileSync(argv.at(-1), "#!/usr/bin/env bash\n");
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (argv[0] === "/usr/bin/bash") {
				return { exitCode: 0, stdout: "installed\n", stderr: "" };
			}
			setup.calls.pop();
			return baseRunner(argv, options);
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(setup.calls).toContainEqual([
			"/usr/bin/curl",
			"-fsSL",
			"https://hermes-agent.nousresearch.com/install.sh",
			"-o",
			expect.stringContaining("hermes-install-"),
		]);
		const installer = setup.calls.find((argv) => argv[0] === "/usr/bin/bash");
		expect(installer?.slice(2)).toEqual([
			"--commit",
			"67764dc0863349a384c16425e73ee8571f3a94b7",
			"--skip-setup",
			"--skip-browser",
			"--skip-computer-use",
			"--non-interactive",
		]);
		expect(installer).not.toContain("--dir");
		expect(setup.messages.join("\n")).toContain("telegramChatId");
	});

	it("stops incomplete when the pinned Hermes bootstrap fails", async () => {
		const setup = fixture();
		setup.hermesCandidates = [];
		setup.whichImpl = (command) =>
			({ bash: "/usr/bin/bash", curl: "/usr/bin/curl" })[command] ?? null;
		setup.runProcessImpl = async (argv) => {
			setup.calls.push(argv);
			if (argv[0] === "/usr/bin/curl") {
				return { exitCode: 22, stdout: "", stderr: "fetch failed" };
			}
			throw new Error(`unexpected command: ${argv.join(" ")}`);
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(setup.calls).toHaveLength(1);
		expect(setup.messages.join("\n")).toContain("bootstrap failed");
		expect(fs.existsSync(path.join(setup.hermesHome, "plugins"))).toBe(false);
	});

	it("deploys a verified relay source but stays incomplete without private Telegram identity", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		const database = path.join(dataDirectory, "relay.sqlite3");
		fs.writeFileSync(database, "existing authority state");

		expect(await configureHermesRelay(setup)).toBe(false);

		const pluginDirectory = path.join(
			setup.hermesHome,
			"plugins",
			"paseo-review-relay",
		);
		for (const file of PLUGIN_FILES) {
			expect(fs.existsSync(path.join(pluginDirectory, file))).toBe(true);
		}
		expect(
			fs.readFileSync(path.join(pluginDirectory, "modes.py"), "utf8"),
		).toBe("modes.py\n");
		const configPath = path.join(dataDirectory, "config.json");
		expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
			telegramChatId: "YOUR_PRIVATE_DM_CHAT_ID",
			telegramUserId: "YOUR_PRIVATE_TELEGRAM_USER_ID",
			serverId: "server-vps",
		});
		expect(fs.statSync(dataDirectory).mode & 0o777).toBe(0o700);
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
		expect(fs.readFileSync(database, "utf8")).toBe("existing authority state");
		expect(
			fs.readlinkSync(path.join(setup.home, ".local", "bin", "hermes-relay")),
		).toBe(path.join(pluginDirectory, "hermes-relay"));
		expect(setup.calls.some((argv) => argv.includes("enable"))).toBe(false);
		expect(setup.messages.join("\n")).toContain("telegramChatId");
		expect(setup.messages.join("\n")).toContain("telegramUserId");
		expect(
			fs.existsSync(
				path.join(setup.home, ".config", "haoshoku", "hermes-relay.json"),
			),
		).toBe(false);
	});

	it("stays incomplete when private Telegram IDs exist but the bot token is absent", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
		);
		setup.telegramCredentialReadyImpl = async () => false;

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(setup.calls.some((argv) => argv.includes("enable"))).toBe(false);
		expect(setup.messages.join("\n")).toContain("TELEGRAM_BOT_TOKEN");
		expect(
			fs.existsSync(
				path.join(setup.home, ".config", "haoshoku", "hermes-relay.json"),
			),
		).toBe(false);
	});

	it("preserves private config when its staged write fails", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		const configPath = path.join(dataDirectory, "config.json");
		const originalConfig =
			'{"telegramChatId":"123456","telegramUserId":"123456","keep":{"private":true}}\n';
		fs.writeFileSync(configPath, originalConfig, { mode: 0o600 });
		setup.fsImpl = {
			...fs,
			writeFileSync(file, ...args) {
				if (path.basename(file).startsWith(".config.json.stage-")) {
					fs.writeFileSync(file, "partial", { mode: 0o600 });
					throw new Error("simulated staged config write failure");
				}
				return fs.writeFileSync(file, ...args);
			},
		};
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = false;

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(fs.readFileSync(configPath, "utf8")).toBe(originalConfig);
		expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
		expect(
			fs.readdirSync(dataDirectory).some((file) => file.includes(".stage-")),
		).toBe(false);
	});

	it("enables, validates, activates, and marks a fully configured relay host", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
		);
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			if (argv.slice(1).join(" ") === "plugins list --enabled --user --json") {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "[]\n", stderr: "" };
			}
			if (
				argv.slice(1).join(" ") ===
				"plugins enable paseo-review-relay --no-allow-tool-override"
			) {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "enabled\n", stderr: "" };
			}
			if (
				argv[1] === "plugins" &&
				argv[2] === "doctor" &&
				argv.at(-1) === "--ci"
			) {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "doctor passed\n", stderr: "" };
			}
			if (argv[0].endsWith("hermes-relay") && argv[1] === "doctor") {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "relay ready\n", stderr: "" };
			}
			if (argv.slice(1).join(" ") === "gateway restart") {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "restarted\n", stderr: "" };
			}
			return baseRunner(argv, options);
		};
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;

		expect(await configureHermesRelay(setup)).toBe(true);

		expect(setup.calls).toContainEqual([
			"/usr/local/bin/hermes",
			"plugins",
			"enable",
			"paseo-review-relay",
			"--no-allow-tool-override",
		]);
		expect(setup.calls).toContainEqual([
			"/usr/local/bin/hermes",
			"gateway",
			"restart",
		]);
		expect(
			JSON.parse(
				fs.readFileSync(
					path.join(setup.home, ".config", "haoshoku", "hermes-relay.json"),
					"utf8",
				),
			),
		).toEqual({ version: 1, enabled: true });
		expect(
			fs.statSync(
				path.join(setup.home, ".config", "haoshoku", "hermes-relay.json"),
			).mode & 0o777,
		).toBe(0o600);
	});

	it("leaves no enabled marker when its staged write fails", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
			{ mode: 0o600 },
		);
		setup.fsImpl = {
			...fs,
			writeFileSync(file, ...args) {
				if (path.basename(file).startsWith(".hermes-relay.json.stage-")) {
					fs.writeFileSync(file, "partial", { mode: 0o600 });
					throw new Error("simulated staged marker write failure");
				}
				return fs.writeFileSync(file, ...args);
			},
		};
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(fs.existsSync(marker)).toBe(false);
		expect(
			fs
				.readdirSync(path.dirname(marker))
				.some((file) => file.includes(".stage-")),
		).toBe(false);
	});

	it("reruns without rewriting private state or restarting an unchanged enabled relay", async () => {
		const setup = fixture();
		const pluginDirectory = path.join(
			setup.hermesHome,
			"plugins",
			"paseo-review-relay",
		);
		fs.mkdirSync(pluginDirectory, { recursive: true, mode: 0o700 });
		for (const file of PLUGIN_FILES) {
			fs.copyFileSync(
				path.join(setup.source, file),
				path.join(pluginDirectory, file),
			);
			fs.chmodSync(
				path.join(pluginDirectory, file),
				file === "hermes-relay" ? 0o755 : 0o600,
			);
		}
		const binDirectory = path.join(setup.home, ".local", "bin");
		fs.mkdirSync(binDirectory, { recursive: true });
		fs.symlinkSync(
			path.join(pluginDirectory, "hermes-relay"),
			path.join(binDirectory, "hermes-relay"),
		);
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
		const configPath = path.join(dataDirectory, "config.json");
		const originalConfig =
			'{"telegramChatId":"123456","telegramUserId":"123456","serverId":"server-vps","keep":{"private":true}}\n';
		fs.writeFileSync(configPath, originalConfig, { mode: 0o600 });
		const database = path.join(dataDirectory, "relay.sqlite3");
		fs.writeFileSync(database, "existing authority state");
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);
		fs.mkdirSync(path.dirname(marker), { recursive: true });
		fs.writeFileSync(marker, '{\n  "version": 1,\n  "enabled": true\n}\n', {
			mode: 0o600,
		});
		fs.utimesSync(marker, new Date(0), new Date(0));
		const markerMtime = fs.statSync(marker).mtimeMs;
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		let activityChecks = 0;
		setup.gatewayActivityImpl = async () => {
			activityChecks += 1;
			return "idle";
		};

		expect(await configureHermesRelay(setup)).toBe(true);

		expect(fs.readFileSync(configPath, "utf8")).toBe(originalConfig);
		expect(fs.readFileSync(database, "utf8")).toBe("existing authority state");
		expect(fs.statSync(marker).mtimeMs).toBe(markerMtime);
		expect(activityChecks).toBe(1);
		expect(setup.calls.some((argv) => argv.includes("restart"))).toBe(false);
		expect(
			fs.existsSync(path.join(setup.hermesHome, "backups", "haoshoku")),
		).toBe(false);
	});

	it("removes the host marker when an unchanged relay is no longer ready", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
			{ mode: 0o600 },
		);
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);

		expect(await configureHermesRelay(setup)).toBe(true);
		expect(fs.existsSync(marker)).toBe(true);

		setup.gatewayActivityImpl = async () => "unknown";
		expect(await configureHermesRelay(setup)).toBe(false);
		expect(fs.existsSync(marker)).toBe(false);
	});

	it("preserves the original incomplete result when marker revocation is denied", async () => {
		const setup = fixture();
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);
		fs.mkdirSync(path.dirname(marker), { recursive: true });
		fs.writeFileSync(marker, '{\n  "version": 1,\n  "enabled": true\n}\n');
		setup.fsImpl = {
			...fs,
			rmSync(file, ...args) {
				if (file === marker) {
					const error = new Error("permission denied");
					error.code = "EACCES";
					throw error;
				}
				return fs.rmSync(file, ...args);
			},
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(fs.existsSync(marker)).toBe(true);
		expect(setup.messages.join("\n")).toContain(
			"Could not revoke the Hermes relay host marker",
		);
	});

	it("keeps an unchanged activated relay enabled while its gateway is busy", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
			{ mode: 0o600 },
		);
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);

		expect(await configureHermesRelay(setup)).toBe(true);
		expect(fs.existsSync(marker)).toBe(true);
		setup.calls.length = 0;

		setup.gatewayActivityImpl = async () => "busy";
		expect(await configureHermesRelay(setup)).toBe(true);
		expect(fs.existsSync(marker)).toBe(true);
		expect(setup.calls.some((argv) => argv.includes("restart"))).toBe(false);
	});

	it("removes a preexisting host marker when an update cannot activate", async () => {
		const setup = fixture();
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true });
		fs.writeFileSync(
			path.join(dataDirectory, "config.json"),
			`${JSON.stringify({
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
			})}\n`,
			{ mode: 0o600 },
		);
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;
		const marker = path.join(
			setup.home,
			".config",
			"haoshoku",
			"hermes-relay.json",
		);

		expect(await configureHermesRelay(setup)).toBe(true);
		expect(fs.existsSync(marker)).toBe(true);

		fs.writeFileSync(path.join(setup.source, "relay.py"), "updated relay.py\n");
		setup.gatewayActivityImpl = async () => "busy";
		expect(await configureHermesRelay(setup)).toBe(false);
		expect(fs.existsSync(marker)).toBe(false);
	});

	it("backs up changed plugin bytes once without touching private config or database", async () => {
		const setup = fixture();
		const pluginDirectory = path.join(
			setup.hermesHome,
			"plugins",
			"paseo-review-relay",
		);
		fs.mkdirSync(pluginDirectory, { recursive: true, mode: 0o700 });
		for (const file of PLUGIN_FILES) {
			if (file === "modes.py") continue;
			fs.copyFileSync(
				path.join(setup.source, file),
				path.join(pluginDirectory, file),
			);
		}
		fs.writeFileSync(
			path.join(pluginDirectory, "plugin.yaml"),
			"name: paseo-review-relay\nversion: 0.1.0\n",
		);
		fs.writeFileSync(
			path.join(pluginDirectory, "relay.py"),
			"old relay bytes\n",
		);
		fs.writeFileSync(path.join(pluginDirectory, "operator-note"), "preserve\n");
		fs.chmodSync(path.join(pluginDirectory, "hermes-relay"), 0o755);
		const binDirectory = path.join(setup.home, ".local", "bin");
		fs.mkdirSync(binDirectory, { recursive: true });
		fs.symlinkSync(
			path.join(pluginDirectory, "hermes-relay"),
			path.join(binDirectory, "hermes-relay"),
		);
		const dataDirectory = path.join(
			setup.hermesHome,
			"plugin-data",
			"paseo-review-relay",
		);
		fs.mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
		const configPath = path.join(dataDirectory, "config.json");
		const originalConfig = `${JSON.stringify(
			{
				telegramChatId: "123456",
				telegramUserId: "123456",
				serverId: "server-vps",
				keep: { private: true },
			},
			null,
			2,
		)}\n`;
		fs.writeFileSync(configPath, originalConfig, { mode: 0o600 });
		const database = path.join(dataDirectory, "relay.sqlite3");
		fs.writeFileSync(database, "existing authority state");
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		setup.gatewayActivityImpl = async () => "idle";
		setup.isTTY = true;
		setup.promptImpl = async () => true;
		setup.nowImpl = () => new Date("2026-09-11T01:02:03Z");

		expect(await configureHermesRelay(setup)).toBe(true);

		const backup = path.join(
			setup.hermesHome,
			"backups",
			"haoshoku",
			"paseo-review-relay-20260911T010203Z",
		);
		expect(fs.readFileSync(path.join(backup, "relay.py"), "utf8")).toBe(
			"old relay bytes\n",
		);
		expect(fs.readFileSync(path.join(backup, "operator-note"), "utf8")).toBe(
			"preserve\n",
		);
		expect(
			fs.readFileSync(path.join(pluginDirectory, "relay.py"), "utf8"),
		).toBe("relay.py\n");
		expect(
			fs.readFileSync(path.join(pluginDirectory, "modes.py"), "utf8"),
		).toBe("modes.py\n");
		expect(fs.readFileSync(configPath, "utf8")).toBe(originalConfig);
		expect(fs.readFileSync(database, "utf8")).toBe("existing authority state");
	});

	for (const [activity, diagnostic] of [
		["busy", "active Hermes work"],
		["unknown", "could not confirm"],
	]) {
		it(`defers activation without prompting when gateway activity is ${activity}`, async () => {
			const setup = fixture();
			const dataDirectory = path.join(
				setup.hermesHome,
				"plugin-data",
				"paseo-review-relay",
			);
			fs.mkdirSync(dataDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(dataDirectory, "config.json"),
				`${JSON.stringify({
					telegramChatId: "123456",
					telegramUserId: "123456",
					serverId: "server-vps",
				})}\n`,
				{ mode: 0o600 },
			);
			addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
			setup.gatewayActivityImpl = async () => activity;
			setup.isTTY = true;
			let promptCalls = 0;
			setup.promptImpl = async () => {
				promptCalls += 1;
				return true;
			};

			expect(await configureHermesRelay(setup)).toBe(false);

			expect(promptCalls).toBe(0);
			expect(setup.calls.some((argv) => argv.includes("restart"))).toBe(false);
			expect(setup.messages.join("\n")).toContain(diagnostic);
			expect(
				fs.existsSync(
					path.join(setup.home, ".config", "haoshoku", "hermes-relay.json"),
				),
			).toBe(false);
		});
	}

	for (const [reason, { activity, isTTY, acceptsRestart }] of [
		["busy gateway", { activity: "busy", isTTY: true, acceptsRestart: true }],
		[
			"noninteractive shell",
			{ activity: "idle", isTTY: false, acceptsRestart: true },
		],
		[
			"declined restart",
			{ activity: "idle", isTTY: true, acceptsRestart: false },
		],
	]) {
		it(`keeps activation pending across reruns after a ${reason}`, async () => {
			const setup = fixture();
			const dataDirectory = path.join(
				setup.hermesHome,
				"plugin-data",
				"paseo-review-relay",
			);
			fs.mkdirSync(dataDirectory, { recursive: true });
			fs.writeFileSync(
				path.join(dataDirectory, "config.json"),
				`${JSON.stringify({
					telegramChatId: "123456",
					telegramUserId: "123456",
					serverId: "server-vps",
				})}\n`,
				{ mode: 0o600 },
			);
			addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
			setup.gatewayActivityImpl = async () => activity;
			setup.isTTY = isTTY;
			setup.promptImpl = async () => acceptsRestart;
			const marker = path.join(
				setup.home,
				".config",
				"haoshoku",
				"hermes-relay.json",
			);

			expect(await configureHermesRelay(setup)).toBe(false);
			expect(await configureHermesRelay(setup)).toBe(false);

			expect(fs.existsSync(marker)).toBe(false);
			expect(setup.calls.some((argv) => argv.includes("restart"))).toBe(false);
		});
	}

	it("derives identity only through the existing Hermes private DM probe", async () => {
		const setup = fixture();
		delete setup.readTelegramIdentityImpl;
		const python = path.join(
			setup.hermesHome,
			"hermes-agent",
			"venv",
			"bin",
			"python",
		);
		fs.mkdirSync(path.dirname(python), { recursive: true });
		fs.writeFileSync(python, "#!/bin/sh\n", { mode: 0o755 });
		addSuccessfulHermesCommands(setup, { initiallyEnabled: true });
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			if (argv[0] === python && argv[3] === "telegram-identity") {
				setup.calls.push(argv);
				return {
					exitCode: 0,
					stdout: '{"chatId":"123456","userId":"123456"}\n',
					stderr: "",
				};
			}
			if (argv[0] === python && argv[3] === "gateway-activity") {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: '{"activity":"idle"}\n', stderr: "" };
			}
			return baseRunner(argv, options);
		};
		setup.isTTY = true;
		setup.promptImpl = async () => true;

		expect(await configureHermesRelay(setup)).toBe(true);

		const config = JSON.parse(
			fs.readFileSync(
				path.join(
					setup.hermesHome,
					"plugin-data",
					"paseo-review-relay",
					"config.json",
				),
				"utf8",
			),
		);
		expect(config).toEqual({
			telegramChatId: "123456",
			telegramUserId: "123456",
			serverId: "server-vps",
		});
		expect(
			setup.calls.filter((argv) => argv[0] === python).map((argv) => argv[3]),
		).toEqual(["telegram-identity", "gateway-activity"]);
	});

	it("rejects a fetched relay whose checked-out commit does not match the lock", async () => {
		const setup = fixture();
		const expectedCommit = "a".repeat(40);
		fs.writeFileSync(
			path.join(setup.projectRoot, "configs", "hermes-relay", "lock.json"),
			`${JSON.stringify({
				version: 1,
				repository: "https://github.com/axatbhardwaj/paseo-hermes-relay.git",
				tag: "v0.2.0",
				commit: expectedCommit,
			})}\n`,
		);
		setup.sourceDirectory = null;
		const baseWhich = setup.whichImpl;
		setup.whichImpl = (command) =>
			command === "git" ? "/usr/bin/git" : baseWhich(command);
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			if (argv[0] === "/usr/bin/git") {
				setup.calls.push(argv);
				if (argv[1] === "clone") {
					const destination = argv.at(-1);
					for (const file of PLUGIN_FILES) {
						fs.copyFileSync(
							path.join(setup.source, file),
							path.join(destination, file),
						);
					}
					return { exitCode: 0, stdout: "", stderr: "" };
				}
				if (argv.includes("checkout")) {
					return { exitCode: 0, stdout: "", stderr: "" };
				}
				if (argv.includes("rev-parse")) {
					return { exitCode: 0, stdout: `${"b".repeat(40)}\n`, stderr: "" };
				}
			}
			return baseRunner(argv, options);
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(
			setup.calls.some(
				(argv) =>
					argv[0] === "/usr/bin/git" &&
					argv[1] === "clone" &&
					argv.includes(
						"https://github.com/axatbhardwaj/paseo-hermes-relay.git",
					),
			),
		).toBe(true);
		expect(setup.messages.join("\n")).toContain("commit mismatch");
		expect(
			fs.existsSync(
				path.join(setup.hermesHome, "plugins", "paseo-review-relay"),
			),
		).toBe(false);
	});

	it("verifies a pinned source-directory override without fetching", async () => {
		const setup = fixture();
		const expectedCommit = "a".repeat(40);
		fs.writeFileSync(
			path.join(setup.projectRoot, "configs", "hermes-relay", "lock.json"),
			`${JSON.stringify({
				version: 1,
				repository: "https://github.com/axatbhardwaj/paseo-hermes-relay.git",
				tag: "v0.2.0",
				commit: expectedCommit,
			})}\n`,
		);
		setup.sourceDirectory = setup.source;
		setup.whichImpl = (command) =>
			({
				git: "/usr/bin/git",
				hermes: "/usr/local/bin/hermes",
				paseo: "/usr/bin/paseo",
			})[command] ?? null;
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			if (argv[0] === "/usr/bin/git" && argv.includes("rev-parse")) {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: `${expectedCommit}\n`, stderr: "" };
			}
			return baseRunner(argv, options);
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(setup.calls.some((argv) => argv.includes("clone"))).toBe(false);
		expect(
			setup.calls.filter((argv) => argv.includes("rev-parse")),
		).toHaveLength(2);
		expect(
			fs.existsSync(
				path.join(
					setup.hermesHome,
					"plugins",
					"paseo-review-relay",
					"plugin.yaml",
				),
			),
		).toBe(true);
	});

	it("seeds config from a fetched source after its temporary checkout is removed", async () => {
		const setup = fixture();
		const expectedCommit = "a".repeat(40);
		fs.writeFileSync(
			path.join(setup.projectRoot, "configs", "hermes-relay", "lock.json"),
			`${JSON.stringify({
				version: 1,
				repository: "https://github.com/axatbhardwaj/paseo-hermes-relay.git",
				tag: "v0.2.0",
				commit: expectedCommit,
			})}\n`,
		);
		setup.sourceDirectory = null;
		setup.whichImpl = (command) =>
			({
				git: "/usr/bin/git",
				hermes: "/usr/local/bin/hermes",
				paseo: "/usr/bin/paseo",
			})[command] ?? null;
		const baseRunner = setup.runProcessImpl;
		setup.runProcessImpl = async (argv, options) => {
			if (argv[0] === "/usr/bin/git" && argv[1] === "clone") {
				setup.calls.push(argv);
				fs.cpSync(setup.source, argv.at(-1), { recursive: true });
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (argv[0] === "/usr/bin/git" && argv.includes("checkout")) {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: "", stderr: "" };
			}
			if (argv[0] === "/usr/bin/git" && argv.includes("rev-parse")) {
				setup.calls.push(argv);
				return { exitCode: 0, stdout: `${expectedCommit}\n`, stderr: "" };
			}
			return baseRunner(argv, options);
		};

		expect(await configureHermesRelay(setup)).toBe(false);

		expect(
			JSON.parse(
				fs.readFileSync(
					path.join(
						setup.hermesHome,
						"plugin-data",
						"paseo-review-relay",
						"config.json",
					),
					"utf8",
				),
			),
		).toEqual({
			telegramChatId: "YOUR_PRIVATE_DM_CHAT_ID",
			telegramUserId: "YOUR_PRIVATE_TELEGRAM_USER_ID",
			serverId: "server-vps",
		});
	});
});
