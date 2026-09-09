import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const roots = [];
const validator = path.join(
	import.meta.dir,
	"../configs/agent-skills/html-deliverables/scripts/validate.py",
);

afterEach(() => {
	for (const root of roots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

function validate({
	artifactType = "explainer",
	summary,
	figure = "",
	decisionBody = "Only the selection remains open.",
}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "html-deliverable-"));
	roots.push(root);
	const artifact = path.join(root, "artifact.html");
	fs.writeFileSync(
		artifact,
		`<!doctype html>
<html lang="en"><head><title>Decision</title>
<script id="html-deliverable-meta" type="application/json">{
  "schema":"html.artifact.${artifactType}.v1","artifact_type":"${artifactType}",
  "title":"Decision","date":"2026-09-09","basis":"pinned source"
}</script><style>
:root{color-scheme: dark;--ground:#0b0f14;--panel:#121821;--panel2:#182130;
--line:#26303e;--ink:#dce4ee;--dim:#8a97a8;--faint:#5c6774;
--primary:#34d399;--secondary:#a78bfa;--team:#5ca9ff;--human:#e0a63d;
--seal:#46c26a;--stop:#ff6a5e;}figure{overflow-x:auto}svg{min-width:1px}
@media (prefers-reduced-motion: reduce){*{animation:none}}
</style></head><body>
<header><h1>Choose the existing preflight</h1><p class="thesis">It fits the team and timeline.</p>
<aside class="status"><p data-status-answer>Decision open.</p><p class="next"><span data-next-answer>Choose one option.</span></p></aside></header>
<main>${summary}
<section id="scope"><p>Three implementation choices.</p></section>
<section id="evidence"><p>Benchmarks and sources.</p>${figure}
<details class="technical"><summary>Sources</summary><p>Exact source evidence.</p></details></section>
<section id="decisions"><p>${decisionBody}</p></section>
<section id="plan"><p>Benchmark the selected route.</p></section></main>
<p class="foot">Decision as of pinned source.</p></body></html>`,
	);
	return Bun.spawnSync(["python3", validator, artifact]);
}

const summaryItems = `
<article data-summary="outcome"><p data-summary-answer>Choose a route.</p></article>
<article data-summary="meaning"><p data-summary-answer>It controls delivery risk.</p></article>
<article data-summary="next"><p data-summary-answer>Approve one option.</p></article>`;

const options = `<table data-options><tbody>
<tr data-option><td>Existing preflight</td><td>Smallest build.</td></tr>
<tr data-option><td>Exact simulation</td><td>More control.</td></tr>
</tbody></table>`;

describe("HTML deliverable decision contract", () => {
	it("accepts a compact decision front below the prose target without padding", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${options}<p data-recommendation>Use the existing preflight because it fits.</p>
<p data-decision-ask>Will peers approve it today?</p></section>`,
		});

		expect(result.exitCode).toBe(0);
	});

	it("rejects options moved below evidence during conversion", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${summaryItems}<p data-recommendation>Use the existing preflight because it fits.</p>
<p data-decision-ask>Will peers approve it today?</p></section>`,
			decisionBody: options,
			figure:
				'<figure><svg aria-label="Comparison"></svg><figcaption>Compare routes.</figcaption></figure>',
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision options must be inside the decision front",
		);
	});

	it("rejects a decision front over 400 words", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${options}<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p><p>${"word ".repeat(401)}</p></section>`,
			figure:
				'<figure><svg aria-label="Comparison"></svg><figcaption>Compare routes.</figcaption></figure>',
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision front exceeds 400 words",
		);
	});

	it("excludes collapsed technical details from the visible front budget", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${options}<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p><details class="technical">
<summary>Full evidence</summary><p>${"word ".repeat(420)}</p></details></section>`,
		});

		expect(result.exitCode).toBe(0);
	});

	it("stops front capture at the section when a paragraph end tag is omitted", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
<p>Short introduction${options}<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p></section>`,
			decisionBody: `Settled.<p>${"scope-word ".repeat(450)}</p>`,
		});

		expect(result.exitCode).toBe(0);
	});

	it("handles omitted table row and cell end tags inside the front", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
<table data-options><tr data-option><td>Existing preflight<td>Smallest build.
<tr data-option><td>Exact simulation<td>More control.</table>
<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p></section>`,
			decisionBody: `Settled.<p>${"scope-word ".repeat(450)}</p>`,
		});

		expect(result.exitCode).toBe(0);
	});

	it("rejects letter-ready options placed after the recommendation", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
<p data-recommendation>Use the existing preflight.</p>${options}
<p data-decision-ask>Approve it?</p></section>`,
			figure:
				'<figure><svg aria-label="Comparison"></svg><figcaption>Compare routes.</figcaption></figure>',
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision options must precede the recommendation",
		);
	});

	it("rejects options inside a collapsed technical disclosure", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
<details class="technical"><summary>Options</summary>${options}</details>
<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p></section>`,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision options must be visible without opening disclosures",
		);
	});

	it("rejects options hidden by an ancestor", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
<div hidden>${options}</div><p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p></section>`,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision options must be visible by default",
		);
	});

	it("rejects a hidden recommendation marker", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${options}<p data-recommendation hidden>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p></section>`,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision recommendation must be visible by default",
		);
	});

	it("rejects an ask inside a technical disclosure", () => {
		const result = validate({
			artifactType: "decision",
			summary: `<section id="summary" data-reader-summary data-decision-front>
${options}<p data-recommendation>Use the existing preflight.</p>
<details class="technical"><summary>Ask</summary>
<p data-decision-ask>Approve it?</p></details></section>`,
		});

		expect(result.exitCode).toBe(1);
		expect(result.stderr.toString()).toContain(
			"decision ask must be visible without opening disclosures",
		);
	});

	for (const voidElement of ["<br/>", '<img src="x" alt="x"/>', "<hr/>"]) {
		it(`counts words after ${voidElement} inside the decision front`, () => {
			const result = validate({
				artifactType: "decision",
				summary: `<section id="summary" data-reader-summary data-decision-front>
<p>Before ${voidElement} after.</p>${options}
<p data-recommendation>Use the existing preflight.</p>
<p data-decision-ask>Approve it?</p><p>${"word ".repeat(401)}</p></section>`,
			});

			expect(result.exitCode).toBe(1);
			expect(result.stderr.toString()).toContain(
				"decision front exceeds 400 words",
			);
		});
	}

	it("keeps ordinary artifact validation compatible without a figure", () => {
		const result = validate({
			summary: `<section id="summary" data-reader-summary>${summaryItems}</section>`,
		});

		expect(result.exitCode).toBe(0);
	});
});
