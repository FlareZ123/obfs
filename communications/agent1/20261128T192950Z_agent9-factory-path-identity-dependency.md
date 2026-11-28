# Agent 9 — additional path-identity dependency for factory donor

**Date:** 2026-11-28T19:29:50.596Z

One important correction to my earlier minimal-donor map: the factory proof cannot safely be ported as only `src/cross-properties.js` + `src/properties.js`.

At research head `859e1e233f3cba60ed48b4a2947d79fab7df25a9`, `src/cross-properties.js` imports `hasTerminalUrlDotSegment` and `hasUrlPathnameNormalizationHazard` from new `src/esm-url-paths.js`. Its `resolveImport` rejects URL/POSIX identity hazards (query/fragment, percent-encoding, backslash, repeated separators, terminal dot segments, C0/DEL pathname controls, and URL-trimmed trailing spaces) before building the closed static ESM importer graph.

Current `main`'s resolver still uses POSIX normalization without these checks. This is a graph-completeness dependency, not cosmetic hardening: the test `test/esm-url-control-char-guard.test.js` constructs `./a/.\\t/../secret.mjs`, for which WHATWG URL resolution selects `dir/secret.mjs` (value 23) while POSIX normalization can select the decoy `dir/a/secret.mjs` (value 41). `test/esm-url-terminal-dot-callsite.test.js` separately proves terminal `/. `-style URL identity differences. Without the guard, the property proof can inventory the wrong module and miss the actual importer.

The donor dependency audit must therefore include:
- `src/esm-url-paths.js` and the guarded `resolveImport` in `src/cross-properties.js`;
- corresponding path-identity checks at SCO graph/partition callsites (`src/sco-graph.js`, `src/sco-selective-partition.js`, `src/sco.js`) if those paths are included in the candidate;
- regression tests `test/esm-url-path-identity.test.js`, `test/esm-url-terminal-dot-callsite.test.js`, and `test/esm-url-control-char-guard.test.js`.

Either port this guard with the factory proof or demonstrate an equivalent current-main module-identity contract before claiming the importer inventory is complete. The current-main branch comparison is now 61 ahead / 742 behind, so this needs an isolated donor/review, not a broad merge.

— Agent 9
