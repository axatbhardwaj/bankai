import { homedir } from "node:os";
import path from "node:path";

async function runProcess(args, options = {}) {
	try {
		const child = Bun.spawn(args, {
			env: options.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { exitCode, stdout, stderr };
	} catch (error) {
		return { exitCode: 127, stdout: "", stderr: error.message };
	}
}

function scopedEnvironment(environment) {
	const clean = { ...environment };
	delete clean.PASEO_HOME;
	delete clean.PASEO_HOST;
	return clean;
}

function validateLocalStatus(status, home) {
	if (path.resolve(status.home ?? "") !== path.resolve(home)) {
		throw new Error(
			`Paseo daemon reported home ${status.home ?? "(missing)"}; expected ${home}`,
		);
	}
	if (
		status.localDaemon !== "running" ||
		status.connectedDaemon !== "reachable"
	) {
		throw new Error(
			"The requested local Paseo daemon is not running and reachable",
		);
	}
	if (
		typeof status.listen !== "string" ||
		!(
			/^(127\.0\.0\.1|localhost):\d+$/.test(status.listen) ||
			/^\[::1\]:\d+$/.test(status.listen)
		)
	) {
		throw new Error(
			`Paseo daemon endpoint ${status.listen ?? "(missing)"} is not loopback`,
		);
	}
	return status.listen;
}

export async function withLocalPaseoScheduleClient(
	task,
	{
		home = path.join(homedir(), ".paseo"),
		environment = process.env,
		whichImpl = Bun.which,
		runProcessImpl = runProcess,
		importClientImpl = () => import("@getpaseo/client/internal/daemon-client"),
	} = {},
) {
	const paseo = whichImpl("paseo");
	if (!paseo) throw new Error("Could not find the paseo CLI");
	const statusResult = await runProcessImpl(
		[paseo, "daemon", "status", "--home", home, "--json"],
		{ env: scopedEnvironment(environment) },
	);
	if (statusResult.exitCode !== 0) {
		throw new Error(
			`Could not inspect the local Paseo daemon (${statusResult.stderr.trim() || `exit ${statusResult.exitCode}`})`,
		);
	}
	let status;
	try {
		status = JSON.parse(statusResult.stdout);
	} catch (error) {
		throw new Error(
			`Paseo daemon status was not valid JSON (${error.message})`,
		);
	}
	const listen = validateLocalStatus(status, home);
	const { DaemonClient } = await importClientImpl();
	const client = new DaemonClient({
		url: `ws://${listen}/ws`,
		clientId: "haoshoku-schedules",
		clientType: "cli",
		connectTimeoutMs: 10000,
		reconnect: { enabled: false },
	});
	try {
		await client.connect();
		return await task(client);
	} finally {
		await client.close();
	}
}
