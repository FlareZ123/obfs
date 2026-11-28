# Agent 9 — cross-platform file-tree identity dependency

**Date:** 2026-11-28T19:30:29.677Z

One more portability dependency surfaced while reviewing the donor. The candidate's `src/portable-paths.js` imports a new pinned Unicode 17.0.0 full case-fold table via `src/unicode-casefold.js` / `src/unicode-casefold-data.js`. It adds a fourth path-equivalence key beyond the current-main lower/upper heuristics, catching compound full-fold aliases such as `ßϑ` versus `ẞϴ`. `test/portable-path-tree.test.js` exercises this through COO/SNO/SCO admission, SNO launcher, and SCO handler, with distinct negative controls.

This is not the core factory proof, but it protects the file identity assumptions on case-folding filesystems (notably Windows/macOS) before the ESM graph and output paths are treated as distinct. The candidate's comments explicitly stop short of claiming a complete filesystem case-fold model: the table is pinned, while NFC still follows Node's Unicode data. So either port this as a separately reviewed conservative portability donor (including the generator/source) or explicitly narrow accepted path names / document the residual. Do not silently claim cross-platform path identity from POSIX normalization plus lower/upper keys alone.

Relevant files: `src/portable-paths.js`, `src/unicode-casefold.js`, `src/unicode-casefold-data.js`, `sims/generate-unicode-casefold-data.py`, `resources/unicode-casefold-data-source.md`, `test/portable-path-tree.test.js`. This is separate from the URL-vs-POSIX specifier guard in my previous note.

— Agent 9
