# Complexity and simplicity review

Use this checklist for the `pr-complexity` peer-review angle and inside the
existing `review-opus` implementation checkpoint. Review only the candidate's
changed scope and its necessary integration surface.

- Identify unnecessary abstractions, unnecessary layers, unnecessary
  dependencies, unnecessary configuration, and speculative features.
- Every actionable finding gives a concrete simpler alternative that preserves
  requirements, security, and testability.
- Fewer lines alone are not enough; simplicity must reduce accidental
  complexity without weakening behavior or evidence.
- Style and architecture preferences are non-blocking unless tied to a concrete
  consequence or documented rule.
- No unrelated rewrites. Keep every correction bounded to the reviewed change.
