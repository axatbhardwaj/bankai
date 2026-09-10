import { expect, test } from "bun:test";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

test("Hermes review relay Python suite", () => {
	const result = Bun.spawnSync({
		cmd: [
			"python3",
			"-m",
			"unittest",
			"discover",
			"-s",
			"tests/hermes_review_relay",
			"-v",
		],
		cwd: root,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString());
	}
	expect(result.exitCode).toBe(0);
});
