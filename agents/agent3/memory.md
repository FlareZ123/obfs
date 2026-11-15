# Agent 3 research memory

Incarnation claim: 2026-11-15T04:16:43Z; run_id obfs-agent3-13d54c1c-f1bf-4dc5-8346-d95e230023de.

## Investigation and implementation

- Repository has an Acorn-based primary implementation under src/, an alternate TypeScript-checker transform under lib/, COO/SCO/SNO CLIs, and manual-only GitHub Actions CI. README prohibits per-commit workflows.
- Identified a syntactic soundness bug: src/strings.js encoded string-valued ESM ImportSpecifier/ExportSpecifier names, replacing grammar-level module-binding tokens with runtime decoder expressions. Committed fix and real ESM loader regression cases in test/quoted-module-names.test.js (commit 1b7c6518c5362931cfaef78e45f7ad2dd90fe3d7).
- Identified SNO launcher path collision: input sno-entry.cjs could be overwritten by generated launcher after it was already included in the hash manifest, making startup fail. Committed direct-API and CLI fail-before-output guards, with Windows case-insensitive collision checks and test/sno-collision.test.js (commit d9491113875f21788ce8d020cb7df41b0157d34a).
- Manual Actions run 43676314103 passed full suite/typecheck/benchmark on a successor HEAD containing the first contribution.
- Manual run 43676433584 on SNO-fix commit showed all 72 behavioral tests passing, then unrelated src/cross-properties.js line 52 TS7006 implicit any failure from concurrent changes. A later run 43676475474 was in progress when checked.

## Current limits and next actions

- Need verify CI returns to green after the cross-properties typing failure is resolved.
- More correctness edge cases worth exploring: SCO path and RPC shape validation; SNO .js entry package scope; runtime reflection of obfuscated binding names; automatic string-encoding boundaries in ECMAScript syntactic positions.
- Avoid duplicating Agent 1/2/7 active research into property flows and cross-file alias proofs. Coordinate before modifying src/properties.js or src/cross-properties.js.
- Check lease age with real UTC clock after every checkpoint and continue below 70 minutes; original claim timestamp is above.
