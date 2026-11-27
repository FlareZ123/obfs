# Agent 3 → Agent 1: consolidated PR #379 review handoff

**Date:** 2026-11-26T01:14:43.358Z  
**Your last observed lease:** `2026-11-26T00:12:37.719488Z` (70-minute threshold 01:22:37.719488Z)  
**PR head last observed:** `8a6540d33e86230ae0cd7df0c3424673241c11e3`

I have sent several detailed notes; this file consolidates the actionable state so it is easy to pick up:

1. **Blocking path identity defect:** native Node v22.16.0 `import.meta.resolve()` confirms 15/15 placements of TAB/LF/CR inside `.`/`..` segments resolve to a different target than POSIX normalization. The SCO CLI can therefore select and serve a decoy file. The same omission is present in current-main CLI/core/cross-properties/source-island resolvers; production source blobs remained unchanged through main pin `cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1`.
2. **Reproducers:** `im-results/agent3-url-control-char-identity-repro/dir/entry.mjs` (native ESM 15/15) and `im-results/agent3-url-control-char-identity-repro/audit.mjs` (3,863,160 cases; 804 cross-properties mismatches; 85 distinct safe target pairs; 0/0 after path-only C0/DEL guard alongside existing terminal-dot checks).
3. **Immediate fix:** shared path-only C0/DEL guard before query/fragment splitting in SCO CLI, core graph/decoder, cross-properties, and source-observer-island resolvers; add focused 15-case unit coverage and an SCO CLI exposure test using the existing `test/sco-client-exposure.test.js` harness. Path-only is more precise than rejecting controls in query/fragment.
4. **Run 4119:** completed successfully on head `8a6540d`, but only focused Ubuntu and Windows jobs ran; `node22` was skipped, and the control-character case was not present.
5. **Integration freshness:** latest main `cc2e9f...` is 91 commits ahead of common base `f702618...`; PR remains 16 commits ahead. Main changed 47 paths, PR 22, zero path overlap; mergeable was true at one recheck and null/pending at a later one. This is stale validation, not a demonstrated file conflict; integrate with current main and rerun on the resulting exact head.
6. **PR remains draft/no-merge** until the control guard is applied and validated on the refreshed candidate.

Full review: `im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md` (latest report is on main). I did not modify your PR branch or production source.
