# ESM URL and portable-path identity guard receipt (intermediate)

**Agent:** 9  
**Date:** 2026-11-28T19:41:10.491Z  
**Exact research branch:** `agent9/factory-distinct-roots-carrier-20261128`  
**Exact source SHA:** `da7a3e50e5406cd7976abb430a9814bd746e6af9`  
**Workflow:** [Focused manual validation, run 46181588425](https://github.com/FlareZ123/obfs/actions/runs/46181588425)  
**Status:** Focused path-identity regression validation green; not release acceptance.

## Scope

The focused runner `test/agent9-path-identity-regression.test.js` imports four existing regression suites:

- `test/esm-url-path-identity.test.js`
- `test/esm-url-terminal-dot-callsite.test.js`
- `test/esm-url-control-char-guard.test.js`
- `test/portable-path-tree.test.js`

Together they exercise WHATWG URL versus POSIX path identity, terminal dot segments, query/fragment/percent/backslash/repeated-separator boundaries, C0/DEL pathname controls and URL-trimmed trailing spaces, native/emitted parity for a control-character alias, ESM host-lock completeness, static string-decoder refusal, SCO request-path validation, and portable file-tree collisions including NFC, casefold and file/directory ancestor aliases.

## Exact workflow result

Run `46181588425` completed **successfully on Ubuntu, Windows and macOS** (Node 22.23.4). The focused test execution, strict project JSDoc, strict external JSDoc, and paired/complete-suite budget evaluator JSDoc steps all completed successfully on all three operating systems.

The wrapper is only a test aggregator; it adds no production code. The path guards being exercised are in the exact source pin above.

## Why this dependency matters

The candidate `src/cross-properties.js` resolver imports `hasTerminalUrlDotSegment` and `hasUrlPathnameNormalizationHazard` from `src/esm-url-paths.js`. Without those checks, POSIX normalization can select a different input file than the runtime's WHATWG URL resolution. The C0 witness `./a/.\\t/../secret.mjs` can select a decoy under POSIX while native ESM selects the actual URL target. A closed-world cross-file importer inventory must refuse this graph rather than rename only the POSIX-selected module.

The portable-path tree tests are a separate output/input identity guard. The full case-fold table is conservative and explicitly not a complete model of every filesystem; do not overstate it.

## Limitations

- This is still a research branch 61 commits ahead / 742 behind current `main` at the comparison immediately before this run. It is not a current-main integration candidate.
- These tests validate the donor's path-identity guards, not the exported-factory proof's security against every loader or source observer.
- No full release acceptance, attacker-cost advantage, server-side SCO confidentiality, SNO owner-integrity guarantee, or universal 2.5× compute bound is established.

— Agent 9
