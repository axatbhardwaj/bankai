---
name: html-deliverables
description: Use automatically when a request nontrivially explains a concept, system, workflow, decision, or comparison, or creates or revises a human-facing HTML report, explainer, audit, review, or status page. Keep trivial facts and explicit text-only answers proportional; architecture-atlas requests retain the system-atlas method.
---

# Human-facing HTML deliverables

Turn authoritative evidence into an explanation that an interested human can
understand without following the underlying work. The first viewport answers:

1. What is the answer or outcome?
2. What does it mean and why does it matter?
3. What is covered, what remains uncertain, and what happens next?

Use an **answer-first** reading order. Put the conclusion, current status, and
next action in the first viewport. Follow with reasoning and evidence. Put
hashes, source inventories, exhaustive matrices, commands, and other audit
material in labelled `<details class="technical">` blocks unless the reader
needs them to understand the conclusion. Keep the canonical Markdown and
appendix complete; make the visible page a budgeted view. Conversion fidelity
includes meaning, prominence, and reading order, not merely word preservation.

Use plain, specific language. Define unavoidable terms on first use, name an
owner only when ownership matters, keep each paragraph to one idea, and make
headings state conclusions. Remove repeated status and ornamental prose. A
diagram must clarify a relationship, carry a prose interpretation, and earn
its space.

## Reader contracts

Before drafting, check the authoritative sources and write the one-sentence
throughline the reader should repeat. If it is not supportable yet, resolve the
source gap before drafting. For source-heavy, visual, or code explanations,
read [references/content-patterns.md](references/content-patterns.md).

When the artifact asks readers to choose among options, use `decision` as its
`artifact_type` and make the decision layer 250–400 visible words. In that
front layer:

1. State the recommendation in plain words and why it fits.
2. Show every option in one `data-options` table. Give each `data-option` row a
   descriptive name, one-sentence mechanism, main tradeoff, and cost or time
   when known. Introduce A/B/C only there as shorthand; names come first.
3. State the recommendation rationale once in `data-recommendation` and the
   one question peers must answer in `data-decision-ask`.
4. State status once. Keep settled/open decisions and the next owner compact.

Keep a decision document at about 1,200 visible words with disclosures
collapsed. Put detailed evidence, source pins, matrices, and secondary
questions in technical disclosures or a linked appendix. Required depth
sections may be brief or disclosed; they do not justify repeated summaries,
status, or implementation narration. These budgets shape decision documents,
not essays or learning pages that require sustained explanatory depth.

## Choose the proportional path

- For a trivial fact or an explicitly text-only answer, respond directly at
  the requested depth. Do not manufacture an HTML artifact or a review chain.
- For an explicit architecture atlas, use `system-atlas` as the owning method.
  When that method produces explanatory HTML, reuse the content/review split
  below rather than starting a parallel route.
- For every other nontrivial explanation request, automatically produce an
  explanatory HTML deliverable through the content-first workflow below, even
  when the user does not mention HTML or name this skill.

## Content-first workflow

The main conversation is the driver. It owns scope, decisions, recovery,
publication authority, and delivery. Before launching a profile, it uses
`model-routing` preflight: inspect the profile notes, provider availability,
configured model, and reasoning effort. Profile IDs are policy keys; do not
substitute another profile when one is unavailable.

Workers remain within their assigned scope and do not create nested teams.
Review this content and UI directly; the `code-review` skill is not part of
this workflow.

1. **Canonical Markdown — `explainer-content-sol` (medium).** Draft or repair
   the explanation from authoritative sources. The Markdown is the content
   authority and includes answer, meaning, coverage, evidence with citations,
   caveats, and next action. Decision Markdown puts its named options and ask
   before supporting research. Trace important claims to the
   actual subject's primary or otherwise authoritative sources; do not treat
   prose quality as evidence. State uncertainty plainly. Everyday conceptual
   pages may say that there is no pending action and cite their conceptual
   basis instead of inventing commit IDs or run metadata. This profile authors
   Markdown only and does not create the site or publish it.
2. **Content approval — `explainer-content-opus` (high).** Independently
   check the actual subject, claim coverage, citations, caveats, and human
   comprehensibility against the authoritative sources. Copy editing alone is
   insufficient. For material claims, use the compact claim-verdict table and
   unresolved tally in `references/content-patterns.md`. Return `APPROVE` or
   `REQUEST_CHANGES` with concrete findings.
   An approval records the SHA-256 of the exact UTF-8 Markdown bytes. A required
   check or claim that cannot be verified is a reported blocker, not an
   approval. Any content change invalidates approval and returns the Markdown
   to Sol, then Opus.
3. **Presentation — `explainer-opus` (medium).** Only after the Markdown has
   Opus approval, convert those exact approved contents into a standalone HTML
   page using `template.html` in this directory. The presentation worker owns
   template use and validator-driven repairs; it does not silently change
   substantive claims. Preserve decision-critical prominence and reading
   order: options that are near the top of approved Markdown stay in the front
   layer even though the template also has `#evidence` and `#decisions`.
4. **Site and fidelity approval — `explainer-review-terra` (high).** Review
   in a fresh session. On its first turn, give the reviewer only the rendered
   page with disclosures collapsed, no source Markdown or prior conversation.
   Within 30 seconds and the first 400 visible words, it records the options,
   recommendation, rationale, and single ask. A missing or inaccurate answer
   is `REQUEST_CHANGES`; record the failure and repair before continuing. After
   that cold record passes, the driver follows up in the same session with the
   approved Markdown and source evidence for desktop, mobile, reduced-motion,
   technical, and fidelity review. Fidelity includes prominence and order.
   Approval binds both the exact UTF-8 source-Markdown digest and the
   exact UTF-8 HTML digest. A required check or claim that cannot be verified
   is a reported blocker, not an approval. Presentation-only findings return
   to the presentation worker; any substantive finding returns to Sol and the
   content reviewer before conversion and the two-phase review repeat.
5. **Delivery — driver.** Deliver the resulting link with a brief answer-first
   summary. Hosting requires user authorization, uses the existing publication
   tool, and publishes the exact Terra-approved HTML bytes. Keep private
   context local unless the user explicitly authorizes a public upload.

## HTML contract

Start from `template.html` in this directory and preserve its complete document
skeleton, `:root` token values, dark color scheme, typography, figure overflow,
answer-first markers, technical-detail disclosure, and reduced-motion rule.
Use the neutral `--primary` and `--secondary` tokens consistently for contrasting
actors or states. Reserve semantic status colors for their template meanings.

Preserve this answer-first DOM structure:

- Treat `h1`, `.thesis`, `.status`, and `.next` as document-wide singletons.
  Put the non-empty `h1`, `.thesis`, and `.status` before every `section`. The
  status contains exactly one non-empty `[data-status-answer]` outside its one
  nested `.next`. That action contains exactly one non-empty
  `[data-next-answer]`; its label does not count as the answer.
- Make `<section id="summary" data-reader-summary>` the first section and the
  only section carrying `data-reader-summary`. Ordinary artifacts include one
  item for each of `data-summary="outcome"`, `data-summary="meaning"`, and
  `data-summary="next"`, each with one non-empty `[data-summary-answer]`.
  Decision artifacts instead mark `#summary` with `data-decision-front` and
  keep `data-options`, `data-recommendation`, and `data-decision-ask` there.
- Include exactly one non-empty section for each depth layer: `#scope`,
  `#evidence`, `#decisions`, and `#plan`. Eyebrows, headings, and disclosure
  labels do not count as body content. Keep a layer compact or disclosed when
  expanding it would only repeat the front layer.
- Include at least one `<details class="technical">`; every such disclosure
  has real body content beyond its `summary` label.

Fill the one `<script id="html-deliverable-meta" type="application/json">`
metadata block with schema `html.artifact.<artifact_type>.v1`, matching
`artifact_type`, title, ISO date, and exact source basis. Use `explainer` as the
standard artifact type unless a more specific requested deliverable type is
materially useful. Replace every placeholder.

Each section opens with an eyebrow and a thesis-style `h2`. Use a figure only
when it materially clarifies a relationship. Every included `figure` contains
an inline `svg` with a non-empty plain-language `aria-label` and a non-empty
`figcaption`; interpret its takeaway in prose. End with a `.foot` stamp naming
what the page reflects and its as-of source/version basis.

Run `python3 <this-skill-directory>/scripts/validate.py <artifact.html>`, then
render and inspect the complete page at desktop and mobile widths. Check text,
contrast, clipped content, horizontal page overflow, figure-local scrolling,
and reduced-motion behavior. Read the first viewport as the intended human:
the answer, meaning, status, and next action must be clear without opening
technical details. For decisions, measure the collapsed visible-word budget
and verify the header plus marked front layer stays within 250–400 visible
words and contains every decision-critical item.
Static validation complements, rather than replaces, this comprehension and
rendered-layout review.

Provenance: imported from
https://github.com/axatbhardwaj/Dvandva/tree/49e8deeae38e13ca50e340b43197e7cede883a45/skills/html-deliverables
at commit `49e8deeae38e13ca50e340b43197e7cede883a45`; adapted to the profile-routed,
content-first workflow.
