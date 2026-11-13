# Minimal Repeated-Block and Language Expansion Adjustment

**Goal:** Keep the original form layout and Add/Delete wording; pin the first block in classification and per-topic elementary-flow completeness; seed language rows only for intrinsically required fields.

**Architecture:** TidasRepeatedField gains opt-in first-block protection without changing field requiredness. Classification retains its metadata defaults and validation anchors, with no added headings/cards or idle validation rows. Required language expansion uses schema metadata independently of validation-mode rules. Existing stored content, serializers and draft/review policy remain unchanged.

- [x] Prove first-block protection, append/delete targeting, optional completeness empty-save behavior and absence of added classification headings.
- [x] Simplify the repeated-field component and classification layout; apply the same protected-first-block behavior to per-topic elementary-flow completeness.
- [x] Keep collection validation registered with zero idle visual footprint and errors shown in the original area.
- [x] Limit authoring-language defaults to required fields and supply stable required metadata at validation-gated callers; preserve existing optional text/manual additions.
- [x] Verify focused regressions, schema-driven caller coverage, locales, typecheck, formatting and browser behavior, then production build.
- [x] Restart this branch's development preview and verify the application loads.

Preserve earlier required stars and classification name/URI defaults. Upstream delivery uses a separate worktree based on dev; the original local preview remains available. Git commits, a fork branch push and an upstream PR are authorized; backend writes and merging are outside this delivery. Run Umi-generating commands serially. Implementation may delegate the isolated language input/caller task; coordinate ownership of the Process form.
