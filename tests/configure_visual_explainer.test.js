import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	ensureExplainerTheme,
	readExplainerTheme,
	setExplainerTheme,
} from "../src/helpers/configure_visual_explainer.js";

const roots = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function fixture() {
	const home = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-explainer-"));
	roots.push(home);
	return {
		configPath: path.join(home, ".config", "haoshoku", "visual-explainer.json"),
		home,
	};
}

const logger = { error() {}, success() {}, warning() {} };

describe("visual-explainer theme preference", () => {
	it("persists dark as the default without rewriting it on upgrade", () => {
		const { configPath, home } = fixture();

		expect(ensureExplainerTheme({ home, logger })).toBe(true);
		const first = fs.readFileSync(configPath, "utf8");
		expect(JSON.parse(first)).toEqual({ theme: "dark" });
		expect(readExplainerTheme({ home, logger })).toBe("dark");

		expect(ensureExplainerTheme({ home, logger })).toBe(true);
		expect(fs.readFileSync(configPath, "utf8")).toBe(first);
	});

	for (const theme of ["light", "system"]) {
		it(`preserves an explicit ${theme} choice on later setup`, () => {
			const { configPath, home } = fixture();

			expect(setExplainerTheme(theme, { home, logger })).toBe(true);
			expect(ensureExplainerTheme({ home, logger })).toBe(true);
			expect(readExplainerTheme({ home, logger })).toBe(theme);
			expect(JSON.parse(fs.readFileSync(configPath, "utf8"))).toEqual({
				theme,
			});
		});
	}

	it("rejects an invalid choice without mutating the existing preference", () => {
		const { configPath, home } = fixture();
		expect(setExplainerTheme("system", { home, logger })).toBe(true);
		const before = fs.readFileSync(configPath);

		expect(setExplainerTheme("sepia", { home, logger })).toBe(false);
		expect(fs.readFileSync(configPath)).toEqual(before);
	});

	it("does not replace malformed existing settings during setup", () => {
		const { configPath, home } = fixture();
		fs.mkdirSync(path.dirname(configPath), { recursive: true });
		fs.writeFileSync(configPath, '{"theme":"light"');
		const before = fs.readFileSync(configPath);

		expect(ensureExplainerTheme({ home, logger })).toBe(false);
		expect(readExplainerTheme({ home, logger })).toBe("dark");
		expect(fs.readFileSync(configPath)).toEqual(before);
	});
});
