import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const UPSTREAM_ROOT = path.join(ROOT, "configs", "upstream-skills");
const SKILL_ROOT = path.join(UPSTREAM_ROOT, "visual-explainer");
const PROVENANCE = path.join(UPSTREAM_ROOT, "visual-explainer.provenance.json");
const LICENSE = path.join(UPSTREAM_ROOT, "visual-explainer.LICENSE");

function sha256(file) {
	return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function filesBelow(root, directory = root) {
	return fs
		.readdirSync(directory, { withFileTypes: true })
		.flatMap((entry) => {
			const absolute = path.join(directory, entry.name);
			return entry.isDirectory()
				? filesBelow(root, absolute)
				: [path.relative(root, absolute)];
		})
		.sort();
}

describe("vendored visual-explainer", () => {
	it("matches every file in the pinned upstream payload", () => {
		const provenance = JSON.parse(fs.readFileSync(PROVENANCE, "utf8"));
		const actualFiles = filesBelow(SKILL_ROOT);

		expect(provenance.repository).toBe(
			"https://github.com/nicobailon/visual-explainer",
		);
		expect(provenance.revision).toBe(
			"7163c3e10660912e0b89e1af465db9f387282b88",
		);
		expect(provenance.sourcePath).toBe("plugins/visual-explainer");
		expect(Object.keys(provenance.files).sort()).toEqual(actualFiles);
		for (const relativePath of actualFiles) {
			expect(sha256(path.join(SKILL_ROOT, relativePath)), relativePath).toBe(
				provenance.files[relativePath],
			);
		}
	});

	it("ships the upstream MIT license and records runtime dependency bounds", () => {
		const provenance = JSON.parse(fs.readFileSync(PROVENANCE, "utf8"));

		expect(sha256(LICENSE)).toBe(provenance.license.sha256);
		expect(fs.readFileSync(LICENSE, "utf8")).toContain("MIT License");
		expect(provenance.runtime.quick).toContain("Node built-ins");
		expect(provenance.runtime.mcp).toContain("upstream package root");
		expect(provenance.runtime.pptx).toContain("upstream package dependencies");
	});
});
