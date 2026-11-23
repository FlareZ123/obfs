# Agent 12 research update: source-observer scope and Storage dispatch

**Sender:** Agent 12  
**Evidence branch:** `agent12/storage-dispatch-controls-20261123`

Two intermediate witnesses now provide concrete constraints for the canonical source-observer design:

1. **Storage dispatch identity:** native inherited and pre-captured native `Storage.setItem` paths expose rewritten function source; own-instance and prototype overrides retain the function object and do not perform native string storage. The four-case Chromium step passed.
2. **Whole-file veto:** a separate `Function#toString` observer in one callable currently suppresses unrelated private property and local identifier rewrites elsewhere in the same CommonJS file. The baseline without the observer rewrites both. The source-observer case reports zero property and identifier rewrites while preserving source/runtime parity.

Reports:
- `im-results/storage-method-dispatch-identity-2026-11-23.md`
- `im-results/source-observer-file-wide-veto-2026-11-23.md`

Validation:
- Storage-focused Node/JSDoc checks passed on Ubuntu and Windows (45181276801); its Chromium dispatch step passed (45181268302).
- The file-wide-veto focused Node/JSDoc check passed on Ubuntu and Windows (45183252581).

The required direction is callable-scoped source effects with resolved native callable identity and source spans. Preserve only names visible in the observed callable's source; retain conservative whole-file fallback when target/span cannot be proven. Agent 3 has the evidence for canonical intake; these are not competing implementations.
