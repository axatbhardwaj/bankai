import { describe, expect, it } from "bun:test";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");
const cli = path.join(projectRoot, "haoshoku.js");
const cliUtils = path.join(projectRoot, "src/common/cli_utils.js");
const relayHelper = path.join(
	projectRoot,
	"src/helpers/configure_hermes_relay.js",
);

function runServerMode(detectedOS, helperResult = true) {
	const childScript = `
		import { mock } from "bun:test";
		mock.module(${JSON.stringify(cliUtils)}, () => ({
			detectOS: () => ${JSON.stringify(detectedOS)},
			findActiveModeFlags: (options) => options.serverHermesRelay ? ["serverHermesRelay"] : [],
		}));
		mock.module(${JSON.stringify(relayHelper)}, () => ({
			configureHermesRelay: async () => {
				console.log("HERMES_RELAY_HELPER_CALLED");
				return ${JSON.stringify(helperResult)};
			},
		}));
		process.argv = [process.execPath, ${JSON.stringify(cli)}, "--server-hermes-relay"];
		await import(${JSON.stringify(cli)} + "?server-hermes-relay-" + ${JSON.stringify(detectedOS)} + "-" + ${JSON.stringify(helperResult)});
	`;
	const child = Bun.spawnSync([process.execPath, "--eval", childScript], {
		stderr: "pipe",
		stdout: "pipe",
	});
	return {
		exitCode: child.exitCode,
		output: `${new TextDecoder().decode(child.stdout)}\n${new TextDecoder().decode(child.stderr)}`,
	};
}

describe("--server-hermes-relay", () => {
	it("rejects non-Debian hosts before invoking the helper", () => {
		const result = runServerMode("arch");
		expect(result.exitCode).toBe(2);
		expect(result.output).toContain("requires a Debian-family host");
		expect(result.output).not.toContain("HERMES_RELAY_HELPER_CALLED");
	});

	it("invokes the helper and propagates incomplete configuration on Debian", () => {
		const result = runServerMode("debian-server", false);
		expect(result.exitCode).toBe(1);
		expect(result.output).toContain("HERMES_RELAY_HELPER_CALLED");
	});
});
