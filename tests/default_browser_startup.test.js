import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = path.join(
	import.meta.dir,
	"..",
	"configs",
	"scripts",
	"haoshoku-default-browser",
);

let directory;
let commandDirectory;
let callLog;

beforeEach(() => {
	directory = fs.mkdtempSync(path.join(os.tmpdir(), "haoshoku-browser-default-"));
	commandDirectory = path.join(directory, "bin");
	callLog = path.join(directory, "calls");
	fs.mkdirSync(commandDirectory);

	for (const command of ["xdg-settings", "xdg-mime"]) {
		const executable = path.join(commandDirectory, command);
		fs.writeFileSync(
			executable,
			`#!/bin/sh\nprintf '%s' '${command}' >> "$CALL_LOG"\nprintf ' %s' "$@" >> "$CALL_LOG"\nprintf '\\n' >> "$CALL_LOG"\n`,
		);
		fs.chmodSync(executable, 0o755);
	}
});

afterEach(() => {
	fs.rmSync(directory, { recursive: true, force: true });
});

describe("haoshoku-default-browser login repair", () => {
	it("registers the Haoshoku router for every browser URL association", () => {
		const result = spawnSync(SCRIPT, [], {
			env: {
				...process.env,
				CALL_LOG: callLog,
				PATH: `${commandDirectory}:/usr/bin`,
			},
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(fs.readFileSync(callLog, "utf8")).toBe(
			[
				"xdg-settings set default-web-browser haoshoku-browser.desktop",
				"xdg-mime default haoshoku-browser.desktop text/html",
				"xdg-mime default haoshoku-browser.desktop x-scheme-handler/http",
				"xdg-mime default haoshoku-browser.desktop x-scheme-handler/https",
				"xdg-mime default haoshoku-browser.desktop x-scheme-handler/about",
				"xdg-mime default haoshoku-browser.desktop x-scheme-handler/unknown",
				"",
			].join("\n"),
		);
	});
});
