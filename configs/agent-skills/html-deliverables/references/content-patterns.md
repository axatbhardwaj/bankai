# Source-backed content patterns

Use only the patterns the subject needs.

## Source check and review

Before drafting, list the material claims and the authoritative source for each.
The content reviewer keeps the result compact:

| Claim | Verdict | Evidence | Fix |
|---|---|---|---|
| One bounded claim | `supported`, `needs-source`, `unsupported`, or `contradicted` | Exact source location | Required repair or none |

Approval requires zero unresolved `needs-source`, `unsupported`, or
`contradicted` material claims. Preserve source pins and content-approval
digests in the appendix or disclosure even when the visible page is shortened.

## Figures

Before a useful figure, tell the reader what it represents and how to read or
operate it. Its caption says what to look for. Provide the same takeaway in
prose, and label proposed behavior as proposed rather than applied. Omit a
figure when prose or a small table communicates the relationship more clearly.

## Code spine

For a codebase explanation, choose one real entry-to-outcome call path as the
spine. Quote only the exact snippets needed to follow it, label each with
`path:line`, and derive the prose and any diagram from actual imports, callers,
and runtime branches. Separate source/configuration evidence from executed or
live-runtime evidence.
