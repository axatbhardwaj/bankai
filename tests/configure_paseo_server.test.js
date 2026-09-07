import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { configurePaseoServer as configurePaseoServerImpl } from "../src/helpers/configure_paseo_server.js";

const homes = [];
const silentLogger = {
	dim() {},
	error() {},
	info() {},
	success() {},
	warning() {},
};

function configurePaseoServer(options) {
	return configurePaseoServerImpl({
		readNetworkFileImpl: () => "",
		...options,
	});
}

function temporaryHome() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-paseo-"));
	homes.push(home);
	return home;
}

afterEach(() => {
	for (const home of homes.splice(0)) {
		fs.rmSync(home, { force: true, recursive: true });
	}
});

function stoppedStatus(home) {
	return {
		localDaemon: "stopped",
		connectedDaemon: "unreachable",
		home: path.join(home, ".paseo"),
		listen: "127.0.0.1:6767",
		relay: "disabled",
		pid: null,
		owner: null,
		desktopManaged: false,
	};
}

function readyStatus(home, uid = 1000) {
	return {
		...stoppedStatus(home),
		localDaemon: "running",
		connectedDaemon: "reachable",
		pid: 202,
		owner: `${uid}@debian`,
	};
}

function successfulHarness(
	home,
	{
		afterStartStatus = readyStatus(home),
		beforeStartStatus = stoppedStatus(home),
		fail = () => false,
		nodeVersions = ["v24.10.0"],
		processCgroup = "/user.slice/user-1000.slice/paseo-daemon.service",
	} = {},
) {
	const calls = [];
	let serviceStarted = false;
	let serviceEnabled = false;
	let lingerEnabled = false;
	let nodeVersionRead = 0;
	const cli = path.join(home, ".local", "bin", "paseo");
	const runProcessImpl = async (args, options = {}) => {
		calls.push({ args, options });
		if (fail(args)) return { exitCode: 1, stdout: "", stderr: "failed" };
		if (args[0] === "node" && args[1] === "--version") {
			const version =
				nodeVersions[Math.min(nodeVersionRead, nodeVersions.length - 1)];
			nodeVersionRead += 1;
			return { exitCode: 0, stdout: `${version}\n`, stderr: "" };
		}
		if (args[0] === "node" && args[1] === "-p") {
			return { exitCode: 0, stdout: "/usr/bin/node\n", stderr: "" };
		}
		if (args[0] === "npm" && args[1] === "--version") {
			return { exitCode: 0, stdout: "11.6.2\n", stderr: "" };
		}
		if (args[0] === "npm" && args.includes("install")) {
			fs.mkdirSync(path.dirname(cli), { recursive: true });
			fs.writeFileSync(cli, "#!/usr/bin/env node\n", { mode: 0o755 });
			return { exitCode: 0, stdout: "", stderr: "" };
		}
		if (args[0] === cli && args[1] === "--version") {
			return { exitCode: 0, stdout: "0.7.2\n", stderr: "" };
		}
		if (args[0] === cli && args[1] === "daemon" && args[2] === "status") {
			const configPath = path.join(home, ".paseo", "config.json");
			if (!fs.existsSync(configPath)) {
				fs.mkdirSync(path.dirname(configPath), { recursive: true });
				fs.writeFileSync(
					configPath,
					'{"version":1,"daemon":{"listen":"127.0.0.1:6767","relay":{"enabled":false}},"app":{"baseUrl":"https://app.paseo.sh"}}\n',
					{ mode: 0o600 },
				);
			}
			return {
				exitCode: 0,
				stdout: JSON.stringify(
					serviceStarted ? afterStartStatus : beforeStartStatus,
				),
				stderr: "",
			};
		}
		if (
			args[0] === "systemctl" &&
			(args.includes("--version") || args.includes("show-environment"))
		) {
			return { exitCode: 0, stdout: "systemd 252\n", stderr: "" };
		}
		if (args[0] === "systemctl" && args.includes("is-active")) {
			return {
				exitCode: serviceStarted ? 0 : 3,
				stdout: serviceStarted ? "active\n" : "inactive\n",
				stderr: "",
			};
		}
		if (args[0] === "systemctl" && args.includes("is-enabled")) {
			return {
				exitCode: serviceEnabled ? 0 : 1,
				stdout: serviceEnabled ? "enabled\n" : "disabled\n",
				stderr: "",
			};
		}
		if (args[0] === "systemctl" && args.includes("enable"))
			serviceEnabled = true;
		if (args[0] === "systemctl" && args.includes("MainPID")) {
			return { exitCode: 0, stdout: "101\n", stderr: "" };
		}
		if (args[0] === "systemctl" && args.includes("ControlGroup")) {
			return {
				exitCode: 0,
				stdout: `${processCgroup}\n`,
				stderr: "",
			};
		}
		if (args[0] === "systemctl" && args.includes("start")) {
			serviceStarted = true;
		}
		if (args[0] === "loginctl" && args.includes("show-user")) {
			return {
				exitCode: 0,
				stdout: lingerEnabled ? "yes\n" : "no\n",
				stderr: "",
			};
		}
		if (args[0] === "loginctl" && args.includes("enable-linger")) {
			lingerEnabled = true;
		}
		return { exitCode: 0, stdout: "", stderr: "" };
	};

	return { calls, cli, runProcessImpl };
}

describe("Paseo server configuration", () => {
	it("configures UID 0 through the root user manager and accepts owner 0", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home, {
			afterStartStatus: readyStatus(home, 0),
			processCgroup: "/user.slice/user-0.slice/paseo-daemon.service",
		});
		const result = await configurePaseoServer({
			environment: {
				DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
				PATH: "/usr/bin",
				XDG_RUNTIME_DIR: "/run/user/1000",
			},
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: () =>
				"0::/user.slice/user-0.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 0,
			user: "root",
		});

		expect(result).toBe(true);
		expect(
			harness.calls.some(
				({ args }) =>
					args[0] === "systemctl" && args.includes("show-environment"),
			),
		).toBe(true);
		for (const { args, options } of harness.calls) {
			if (args[0] !== "systemctl" || !args.includes("--user")) continue;
			expect(options.env.XDG_RUNTIME_DIR).toBe("/run/user/0");
			expect(options.env.DBUS_SESSION_BUS_ADDRESS).toBe(
				"unix:path=/run/user/0/bus",
			);
		}
		expect(
			harness.calls.some(
				({ args }) =>
					args[0] === "loginctl" &&
					args.includes("show-user") &&
					args.includes("root"),
			),
		).toBe(true);
		expect(
			fs.readFileSync(
				path.join(home, ".config", "systemd", "user", "paseo-daemon.service"),
				"utf8",
			),
		).toContain(`--home ${path.join(home, ".paseo")}`);
	});

	it("installs Node.js without sudo when UID 0 owns Paseo", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home, {
			afterStartStatus: readyStatus(home, 0),
			nodeVersions: ["v22.20.0", "v24.10.0"],
			processCgroup: "/user.slice/user-0.slice/paseo-daemon.service",
		});

		expect(
			await configurePaseoServer({
				home,
				isTTY: false,
				logger: silentLogger,
				readProcessFileImpl: () =>
					"0::/user.slice/user-0.slice/paseo-daemon.service\n",
				runProcessImpl: harness.runProcessImpl,
				sleepImpl: async () => {},
				uid: 0,
				user: "root",
			}),
		).toBe(true);
		expect(harness.calls.map(({ args }) => args)).toContainEqual([
			"bash",
			"-c",
			"set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_24.x | bash -",
		]);
		expect(harness.calls.map(({ args }) => args)).toContainEqual([
			"apt-get",
			"install",
			"-y",
			"nodejs",
		]);
	});

	it("fails clearly when the root systemd user manager is unavailable", async () => {
		const home = temporaryHome();
		const errors = [];
		const harness = successfulHarness(home, {
			fail: (args) => args.includes("show-environment"),
		});

		expect(
			await configurePaseoServer({
				home,
				logger: { ...silentLogger, error: (message) => errors.push(message) },
				runProcessImpl: harness.runProcessImpl,
				uid: 0,
				user: "root",
			}),
		).toBe(false);
		expect(errors.join("\n")).toContain("root systemd user manager");
		expect(errors.join("\n")).toContain("/run/user/0/bus");
		expect(
			fs.existsSync(
				path.join(home, ".config", "systemd", "user", "paseo-daemon.service"),
			),
		).toBe(false);
	});

	it("fails closed on malformed config without changing its bytes", async () => {
		const home = temporaryHome();
		const configPath = path.join(home, ".paseo", "config.json");
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		const malformed = '{"version":1,"daemon":';
		fs.writeFileSync(configPath, malformed);
		const commands = [];
		const result = await configurePaseoServer({
			home,
			logger: silentLogger,
			runProcessImpl: async (args) => {
				commands.push(args);
				return { exitCode: 0, stdout: "", stderr: "" };
			},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
		expect(commands).toEqual([]);
		expect(fs.readFileSync(configPath, "utf8")).toBe(malformed);
	});

	it("fails clearly when Node.js 24 cannot be prepared", async () => {
		const home = temporaryHome();
		const commands = [];
		const errors = [];
		const result = await configurePaseoServer({
			home,
			logger: { ...silentLogger, error: (message) => errors.push(message) },
			runProcessImpl: async (args) => {
				commands.push(args);
				if (args[0] === "node") {
					return { exitCode: 0, stdout: "v22.20.0\n", stderr: "" };
				}
				return { exitCode: 1, stdout: "", stderr: "failed" };
			},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
		expect(commands.at(-1)).toEqual([
			"bash",
			"-c",
			"set -o pipefail; curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -",
		]);
		expect(errors.join("\n")).toContain("NodeSource");
		expect(fs.existsSync(path.join(home, ".paseo"))).toBe(false);
	});

	it("propagates a user-prefix CLI installation failure", async () => {
		const home = temporaryHome();
		const commands = [];
		const errors = [];
		const result = await configurePaseoServer({
			home,
			logger: { ...silentLogger, error: (message) => errors.push(message) },
			runProcessImpl: async (args) => {
				commands.push(args);
				if (args[0] === "node" && args[1] === "--version") {
					return { exitCode: 0, stdout: "v24.10.0\n", stderr: "" };
				}
				if (args[0] === "node") {
					return { exitCode: 0, stdout: "/usr/bin/node\n", stderr: "" };
				}
				if (args[0] === "npm" && args[1] === "--version") {
					return { exitCode: 0, stdout: "11.6.2\n", stderr: "" };
				}
				return { exitCode: 1, stdout: "", stderr: "install failed" };
			},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
		expect(commands.find((args) => args.includes("install"))).toEqual([
			"npm",
			"--global",
			"--prefix",
			path.join(home, ".local"),
			"install",
			"@getpaseo/cli",
		]);
		expect(errors.join("\n")).toContain("compatible @getpaseo/cli");
		expect(fs.existsSync(path.join(home, ".paseo"))).toBe(false);
	});

	it("installs a missing user CLI and starts a persistent loopback daemon", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home);
		const messages = [];
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: { ...silentLogger, info: (message) => messages.push(message) },
			readProcessFileImpl: (_pid, filename) =>
				filename === "cgroup"
					? "0::/user.slice/user-1000.slice/paseo-daemon.service\n"
					: "",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(true);
		expect(
			JSON.parse(
				fs.readFileSync(path.join(home, ".paseo", "config.json"), "utf8"),
			),
		).toEqual({
			$schema: "https://paseo.sh/schemas/paseo.config.v1.json",
			version: 1,
			daemon: {
				listen: "127.0.0.1:6767",
				relay: { enabled: false },
				mcp: { enabled: true },
			},
			features: { webUi: { enabled: false } },
		});
		expect(
			fs.statSync(path.join(home, ".paseo", "config.json")).mode & 0o777,
		).toBe(0o600);
		const unit = fs.readFileSync(
			path.join(home, ".config", "systemd", "user", "paseo-daemon.service"),
			"utf8",
		);
		expect(unit).toContain("Restart=on-failure");
		expect(unit).toContain(
			`ExecStart=${harness.cli} daemon start --foreground --home ${path.join(home, ".paseo")}`,
		);
		expect(unit).not.toContain("--listen");
		expect(unit).not.toContain("--relay");
		expect(
			harness.calls.some(({ args }) => args.includes("@getpaseo/cli")),
		).toBe(true);
		expect(
			harness.calls.some(
				({ args }) => args[0] === "systemctl" && args.includes("start"),
			),
		).toBe(true);
		expect(messages.join("\n")).toContain("daemon pair --relay --home");
		expect(harness.calls.some(({ args }) => args.includes("pair"))).toBe(false);
	});

	it("preserves a valid config created during the fresh-home preflight", async () => {
		const home = temporaryHome();
		const configPath = path.join(home, ".paseo", "config.json");
		const racedConfig =
			'{"version":1,"daemon":{"listen":"custom.sock"},"unknown":"keep"}\n';
		const harness = successfulHarness(home);

		expect(
			await configurePaseoServer({
				home,
				isTTY: false,
				logger: silentLogger,
				readNetworkFileImpl: () => {
					fs.mkdirSync(path.dirname(configPath), { recursive: true });
					fs.writeFileSync(configPath, racedConfig, { flag: "wx" });
					return "sl local_address rem_address st\n";
				},
				readProcessFileImpl: () =>
					"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
				runProcessImpl: harness.runProcessImpl,
				sleepImpl: async () => {},
				uid: 1000,
				user: "alice",
			}),
		).toBe(true);
		expect(fs.readFileSync(configPath, "utf8")).toBe(racedConfig);
	});

	it("preserves existing config bytes and reruns without restarting a working daemon", async () => {
		const home = temporaryHome();
		const configPath = path.join(home, ".paseo", "config.json");
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		const customConfig =
			'{\n  "version": 1,\n  "unknown": {"keep": true},\n  "daemon": {"listen": "custom.sock", "relay": {"enabled": true}, "auth": {"password": "hash"}},\n  "agents": {"profiles": {"review": {"provider": "codex"}}}\n}\n';
		fs.writeFileSync(configPath, customConfig, { mode: 0o600 });
		const harness = successfulHarness(home);
		const options = {
			environment: {
				PATH: "/usr/bin",
				PASEO_HOME: "/wrong/home",
				PASEO_HOST: "public.example:6767",
			},
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		};

		expect(await configurePaseoServer(options)).toBe(true);
		const unitPath = path.join(
			home,
			".config",
			"systemd",
			"user",
			"paseo-daemon.service",
		);
		const firstUnit = fs.readFileSync(unitPath, "utf8");
		const firstCallCount = harness.calls.length;
		expect(await configurePaseoServer(options)).toBe(true);
		const rerunCalls = harness.calls.slice(firstCallCount);

		expect(fs.readFileSync(configPath, "utf8")).toBe(customConfig);
		expect(fs.readFileSync(unitPath, "utf8")).toBe(firstUnit);
		expect(
			rerunCalls.some(
				({ args }) =>
					args.includes("start") ||
					args.includes("restart") ||
					args.includes("daemon-reload"),
			),
		).toBe(false);
		for (const { args, options: callOptions } of harness.calls) {
			if (args[0] !== harness.cli || args[1] !== "daemon") continue;
			expect(callOptions.env.PASEO_HOME).toBeUndefined();
			expect(callOptions.env.PASEO_HOST).toBeUndefined();
			expect(args).toContain(path.join(home, ".paseo"));
		}
	});

	it("restarts a healthy managed daemon when its unit definition changes", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home);
		const options = {
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		};

		expect(await configurePaseoServer(options)).toBe(true);
		const unitPath = path.join(
			home,
			".config",
			"systemd",
			"user",
			"paseo-daemon.service",
		);
		fs.writeFileSync(unitPath, "# Managed by Haoshoku\n[Service]\nExecStart=/old\n");
		const firstCallCount = harness.calls.length;

		expect(await configurePaseoServer(options)).toBe(true);
		const rerunCalls = harness.calls.slice(firstCallCount);
		expect(
			rerunCalls.some(
				({ args }) =>
					args[0] === "systemctl" &&
					args.includes("restart") &&
					args.includes("paseo-daemon.service"),
			),
		).toBe(true);
	});

	it("fails when a changed managed unit cannot be restarted", async () => {
		const home = temporaryHome();
		let failRestart = false;
		const errors = [];
		const harness = successfulHarness(home, {
			fail: (args) => failRestart && args.includes("restart"),
		});
		const options = {
			home,
			isTTY: false,
			logger: { ...silentLogger, error: (message) => errors.push(message) },
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		};

		expect(await configurePaseoServer(options)).toBe(true);
		fs.writeFileSync(
			path.join(
				home,
				".config",
				"systemd",
				"user",
				"paseo-daemon.service",
			),
			"# Managed by Haoshoku\n[Service]\nExecStart=/old\n",
		);
		failRestart = true;

		expect(await configurePaseoServer(options)).toBe(false);
		expect(errors.join("\n")).toContain(
			"Could not restart paseo-daemon.service",
		);
	});

	it("keeps a compatible user-owned CLI without running npm install", async () => {
		const home = temporaryHome();
		const cli = path.join(home, ".local", "bin", "paseo");
		fs.mkdirSync(path.dirname(cli), { recursive: true });
		fs.writeFileSync(cli, "#!/usr/bin/env node\n", { mode: 0o755 });
		const harness = successfulHarness(home);
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(true);
		expect(harness.calls.some(({ args }) => args[0] === "npm")).toBe(false);
	});

	it("refuses an unmanaged running daemon without changing its config", async () => {
		const home = temporaryHome();
		const configPath = path.join(home, ".paseo", "config.json");
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		const existingConfig = '{"version":1,"unknown":"keep"}\n';
		fs.writeFileSync(configPath, existingConfig);
		const errors = [];
		const harness = successfulHarness(home, {
			beforeStartStatus: readyStatus(home),
		});
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: { ...silentLogger, error: (message) => errors.push(message) },
			readProcessFileImpl: () => "0::/foreign.service\n",
			runProcessImpl: harness.runProcessImpl,
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
		expect(
			fs.existsSync(
				path.join(home, ".config", "systemd", "user", "paseo-daemon.service"),
			),
		).toBe(false);
		expect(fs.readFileSync(configPath, "utf8")).toBe(existingConfig);
		expect(errors.join("\n")).toContain("unmanaged or desktop");
		expect(errors.join("\n")).toContain("Stop it explicitly");
	});

	it("reports a cross-home listen conflict without claiming this home is running", async () => {
		const home = temporaryHome();
		const errors = [];
		const harness = successfulHarness(home, {
			beforeStartStatus: {
				...stoppedStatus(home),
				connectedDaemon: "reachable",
			},
		});

		expect(
			await configurePaseoServer({
				home,
				isTTY: false,
				logger: { ...silentLogger, error: (message) => errors.push(message) },
				readNetworkFileImpl: () =>
					"sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n0: 0100007F:1A6F 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 1\n",
				runProcessImpl: harness.runProcessImpl,
				uid: 1000,
				user: "alice",
			}),
		).toBe(false);
		expect(fs.existsSync(path.join(home, ".paseo", "config.json"))).toBe(
			false,
		);
		expect(errors.join("\n")).toContain(
			"127.0.0.1:6767 is already serving another Paseo daemon",
		);
		expect(errors.join("\n")).toContain("different listen address");
		expect(errors.join("\n")).not.toContain(
			`already using ${path.join(home, ".paseo")}`,
		);
		expect(
			harness.calls.some(
				({ args }) => args[0] === harness.cli && args.includes("status"),
			),
		).toBe(false);
	});

	it("refuses an ambiguous PID file before asking status to seed config", async () => {
		const home = temporaryHome();
		const paseoHome = path.join(home, ".paseo");
		fs.mkdirSync(paseoHome, { recursive: true });
		fs.writeFileSync(
			path.join(paseoHome, "paseo.pid"),
			'{"pid":202,"startedAt":"2026-09-08T00:00:00.000Z"}\n',
		);
		const errors = [];
		const harness = successfulHarness(home);

		expect(
			await configurePaseoServer({
				home,
				isTTY: false,
				logger: { ...silentLogger, error: (message) => errors.push(message) },
				runProcessImpl: harness.runProcessImpl,
				uid: 1000,
				user: "alice",
			}),
		).toBe(false);
		expect(fs.existsSync(path.join(paseoHome, "config.json"))).toBe(false);
		expect(errors.join("\n")).toContain("paseo.pid without config.json");
		expect(
			harness.calls.some(
				({ args }) => args[0] === harness.cli && args.includes("status"),
			),
		).toBe(false);
	});

	it("leaves a foreign unit untouched", async () => {
		const home = temporaryHome();
		const unitPath = path.join(
			home,
			".config",
			"systemd",
			"user",
			"paseo-daemon.service",
		);
		fs.mkdirSync(path.dirname(unitPath), { recursive: true });
		const foreignUnit = "[Service]\nExecStart=/opt/custom/paseo\n";
		fs.writeFileSync(unitPath, foreignUnit);
		const harness = successfulHarness(home);

		expect(
			await configurePaseoServer({
				home,
				isTTY: false,
				logger: silentLogger,
				runProcessImpl: harness.runProcessImpl,
				uid: 1000,
				user: "alice",
			}),
		).toBe(false);
		expect(fs.readFileSync(unitPath, "utf8")).toBe(foreignUnit);
		expect(fs.existsSync(path.join(home, ".paseo", "config.json"))).toBe(
			false,
		);
		expect(
			harness.calls.some(
				({ args }) => args[0] === "systemctl" && args.includes("daemon-reload"),
			),
		).toBe(false);
	});

	it("fails when lingering cannot be enabled and does not start the service", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home, {
			fail: (args) => args[0] === "loginctl" && args.includes("enable-linger"),
		});
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
		expect(
			harness.calls.some(
				({ args }) => args[0] === "systemctl" && args.includes("start"),
			),
		).toBe(false);
	});

	it("rejects a reachable daemon whose PID is outside the service cgroup", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home);
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: (_pid, filename) => {
				if (filename === "cgroup") return "0::/user.slice/foreign.service\n";
				throw new Error("ancestry unavailable");
			},
			readyAttempts: 2,
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(false);
	});

	it("accepts the reported supervisor PID when it descends from MainPID", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home);
		const result = await configurePaseoServer({
			home,
			isTTY: false,
			logger: silentLogger,
			readProcessFileImpl: (pid, filename) => {
				if (filename === "cgroup") return "0::/unavailable.service\n";
				if (pid === 202 && filename === "stat") return "202 (paseo) S 101 0 0";
				throw new Error("unexpected process");
			},
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(true);
	});

	it("streams an accepted relay pairing prompt and propagates pairing failure", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home, {
			fail: (args) => args[0]?.endsWith("/paseo") && args.includes("pair"),
		});
		const result = await configurePaseoServer({
			home,
			isTTY: true,
			logger: silentLogger,
			promptImpl: async () => true,
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});
		const pair = harness.calls.find(({ args }) => args.includes("pair"));

		expect(result).toBe(false);
		expect(pair.args).toEqual([
			harness.cli,
			"daemon",
			"pair",
			"--relay",
			"--home",
			path.join(home, ".paseo"),
		]);
		expect(pair.options.stdio).toBe("inherit");
	});

	it("keeps a declined interactive pairing optional", async () => {
		const home = temporaryHome();
		const harness = successfulHarness(home);
		const prompts = [];
		const result = await configurePaseoServer({
			home,
			isTTY: true,
			logger: silentLogger,
			promptImpl: async (message, initial) => {
				prompts.push({ message, initial });
				return false;
			},
			readProcessFileImpl: () =>
				"0::/user.slice/user-1000.slice/paseo-daemon.service\n",
			runProcessImpl: harness.runProcessImpl,
			sleepImpl: async () => {},
			uid: 1000,
			user: "alice",
		});

		expect(result).toBe(true);
		expect(prompts).toEqual([
			{
				message: "Pair a phone through Paseo's encrypted relay now?",
				initial: false,
			},
		]);
		expect(harness.calls.some(({ args }) => args.includes("pair"))).toBe(false);
	});
});
