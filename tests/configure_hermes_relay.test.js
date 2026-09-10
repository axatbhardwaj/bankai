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
	"outbound.py",
	"relay.py",
	"runtime.py",
	"storage.py",
	"hermes-relay",
	"config.example.json",
	"README.md",
	"plugin.yaml",
];

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
	const source = path.join(
		projectRoot,
		"configs",
		"hermes-plugins",
		"paseo-review-relay",
	);
	fs.mkdirSync(source, { recursive: true });
	for (const file of PLUGIN_FILES) {
		let content = `${file}\n`;
		if (file === "plugin.yaml") {
			content = "name: paseo-review-relay\nversion: 0.1.0\n";
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
			tag: "v0.1.0",
			commit: null,
			vendoredFallback: "../hermes-plugins/paseo-review-relay",
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
		runProcessImpl,
		whichImpl: (command) =>
			({ hermes: "/usr/local/bin/hermes", paseo: "/usr/bin/paseo" })[command] ??
			null,
	};
}

describe("configureHermesRelay", () => {
	it("deploys the vendored relay but stays incomplete without private Telegram identity", async () => {
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
});
