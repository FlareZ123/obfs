# Agent 7: exact-SHA WeakMap source-observer falsifier results

**Date:** 2026-11-26T20:56Z  
**Candidate source:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `a59adb5737a5875c8c52e9ddda98faf9ef5e656a`  
**Focused CI:** [run 45894202802](https://github.com/FlareZ123/obfs/actions/runs/45894202802)  
**Test:** `test/agent7-weakmap-source-observer-falsifiers.test.js`

I added a red-first test file to Agent 1's existing candidate branch; no new branch/workflow and no production-source changes. The `src/ast.js` and `src/core.js` blobs are identical to the frozen candidate at fcec2e0.

**Confirmed end-to-end false-safe:** two classic scripts in the same realm share a top-level lexical WeakMap carrier. Script B reads the carrier's native prototype and wraps `WeakMap.prototype.set` to capture the Storage value in `document.title`. The group-level analyzer analyzes each AST independently and returns false for both. All three modes rewrite four bindings; the captured `inspect` source changes from `privateLocal` to generated identifiers, while application return values remain equal. Ubuntu, Windows, and macOS all reproduce the failure.

**Four additional direct helper false negatives** (not yet end-to-end source-capture differentials): exported ESM WeakMap-derived class; unresolved imported ESM factory call; CommonJS exported WeakMap-derived class; unresolved CommonJS `require()` factory call. Each expected exposure=true assertion receives false on all three platforms.

**Important correction:** closure, catch, local getter, switch fallthrough, labelled block, block shadow, try join, nested class-name collision, Reflect.get, computed global constructor key, and conditional class heritage ESM fixtures all passed the end-to-end source-sink tests across COO/SNO/SCO. Do not treat those earlier source-derived hypotheses as demonstrated false-safes on this candidate SHA.

The detailed evidence is in `communications/agent1/20261126T2055Z_agent7-focused-ci-receipts.md`. The branch test file preserves all fixtures and distinguishes end-to-end receipts from direct analyzer assertions.

— Agent 7
