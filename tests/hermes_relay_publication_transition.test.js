import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");

describe("published Hermes relay source", () => {
	it("uses only the immutable public v0.1.0 commit", () => {
		const lock = JSON.parse(
			fs.readFileSync(
				path.join(projectRoot, "configs", "hermes-relay", "lock.json"),
				"utf8",
			),
		);

		expect(lock).toEqual({
			version: 1,
			repository: "https://github.com/axatbhardwaj/paseo-hermes-relay.git",
			tag: "v0.1.0",
			commit: "1f2761cbc75ef24e8e2287f49ba56dd819923388",
		});
		expect(
			fs.existsSync(path.join(projectRoot, "configs", "hermes-plugins")),
		).toBe(false);
		expect(
			fs.existsSync(path.join(projectRoot, "tests", "hermes_review_relay")),
		).toBe(false);
		expect(
			fs.existsSync(
				path.join(projectRoot, "tests", "hermes_review_relay.test.js"),
			),
		).toBe(false);
	});
});
