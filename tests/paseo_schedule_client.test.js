import { describe, expect, it } from "bun:test";

import { withLocalPaseoScheduleClient } from "../src/helpers/paseo_schedule_client.js";

describe("local Paseo schedule client", () => {
	it("connects only to the matching loopback daemon with scoped environment", async () => {
		const events = [];
		class FakeDaemonClient {
			constructor(options) {
				events.push(["construct", options]);
			}
			async connect() {
				events.push(["connect"]);
			}
			close() {
				events.push(["close"]);
			}
		}
		const home = "/tmp/paseo-home";

		const result = await withLocalPaseoScheduleClient(
			async () => {
				events.push(["task"]);
				return "checked";
			},
			{
				home,
				environment: {
					PATH: "/usr/bin",
					PASEO_HOME: "/wrong/home",
					PASEO_HOST: "ssh://remote",
				},
				whichImpl: () => "/usr/bin/paseo",
				runProcessImpl: async (args, options) => {
					expect(args).toEqual([
						"/usr/bin/paseo",
						"daemon",
						"status",
						"--home",
						home,
						"--json",
					]);
					expect(options.env).toEqual({ PATH: "/usr/bin" });
					return {
						exitCode: 0,
						stderr: "",
						stdout: JSON.stringify({
							home,
							listen: "127.0.0.1:6767",
							localDaemon: "running",
							connectedDaemon: "reachable",
						}),
					};
				},
				importClientImpl: async () => ({ DaemonClient: FakeDaemonClient }),
			},
		);

		expect(result).toBe("checked");
		expect(events).toEqual([
			[
				"construct",
				{
					url: "ws://127.0.0.1:6767/ws",
					clientId: "haoshoku-schedules",
					clientType: "cli",
					connectTimeoutMs: 10000,
					reconnect: { enabled: false },
				},
			],
			["connect"],
			["task"],
			["close"],
		]);
	});

	for (const [label, status] of [
		[
			"foreign home",
			{
				home: "/tmp/other",
				listen: "127.0.0.1:6767",
				localDaemon: "running",
				connectedDaemon: "reachable",
			},
		],
		[
			"stopped daemon",
			{
				home: "/tmp/paseo-home",
				listen: "127.0.0.1:6767",
				localDaemon: "stopped",
				connectedDaemon: "unreachable",
			},
		],
		[
			"non-loopback endpoint",
			{
				home: "/tmp/paseo-home",
				listen: "10.0.0.8:6767",
				localDaemon: "running",
				connectedDaemon: "reachable",
			},
		],
	]) {
		it(`refuses a ${label} before loading the SDK`, async () => {
			let imported = false;
			await expect(
				withLocalPaseoScheduleClient(async () => true, {
					home: "/tmp/paseo-home",
					whichImpl: () => "/usr/bin/paseo",
					runProcessImpl: async () => ({
						exitCode: 0,
						stderr: "",
						stdout: JSON.stringify(status),
					}),
					importClientImpl: async () => {
						imported = true;
					},
				}),
			).rejects.toThrow();
			expect(imported).toBe(false);
		});
	}

	it("closes SDK resources when the initial connection fails", async () => {
		let closed = false;
		class FailingDaemonClient {
			async connect() {
				throw new Error("connect failed");
			}
			close() {
				closed = true;
			}
		}

		await expect(
			withLocalPaseoScheduleClient(async () => true, {
				home: "/tmp/paseo-home",
				whichImpl: () => "/usr/bin/paseo",
				runProcessImpl: async () => ({
					exitCode: 0,
					stderr: "",
					stdout: JSON.stringify({
						home: "/tmp/paseo-home",
						listen: "127.0.0.1:6767",
						localDaemon: "running",
						connectedDaemon: "reachable",
					}),
				}),
				importClientImpl: async () => ({
					DaemonClient: FailingDaemonClient,
				}),
			}),
		).rejects.toThrow("connect failed");
		expect(closed).toBe(true);
	});
});
