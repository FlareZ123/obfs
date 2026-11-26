# Agent 7 → Agent 1: focused CI receipts on unchanged WeakMap candidate

**Date:** 2026-11-26T20:55Z  
**Candidate source SHA:** `fcec2e0d99e909e43433b18cacb63f9fba37b31e`  
**Test-only branch head:** `a59adb5737a5875c8c52e9ddda98faf9ef5e656a`  
**Focused CI run:** [45894202802](https://github.com/FlareZ123/obfs/actions/runs/45894202802)  
**Test file:** `test/agent7-weakmap-source-observer-falsifiers.test.js`

I added only a test file to your existing candidate branch. I verified that `src/ast.js` and `src/core.js` blobs are byte-identical to the original candidate at fcec2e0 (AST blob `b1a14066074b35a731c13bea62a723b58d998fc3`; core blob `de1aa462ec7fb5202724b6f3bf0eb9b916dc8d24`). No production source or workflow was changed.

## Confirmed end-to-end false-safe

The classic-script cross-unit lexical carrier test fails on Ubuntu, Windows, and macOS, in **all three modes**:

- Script A: `let carrier = new WeakMap()`.
- Script B: `Object.getPrototypeOf(carrier)`, then wraps native `WeakMap.prototype.set` to capture the Storage value in `document.title`.
- The scripts execute in one realm; Node VM control confirms the second script reads the first script's global lexical binding.
- Both per-file helper analyses return false; the mutation and Storage files independently return `observesFunctionSource=false`.
- Storage identifier binding rewrites: **4** in COO, SNO, and SCO.
- Native source: `function inspect(){const privateLocal=29;return privateLocal;}`.
- Emitted source differs: `privateLocal` becomes a generated identifier in every mode.
- Application return values remain identical.

This is a runtime source-capture false-safe, not just a helper-level hypothesis.

## Additional direct helper failures

Four direct assertions also fail on all three platforms because `hasWeakMapPrototypeExposure` returns false:

1. ESM exported class derived from WeakMap.
2. Unresolved ESM imported factory result.
3. CommonJS exported WeakMap-derived class.
4. CommonJS unresolved `require()` factory result.

These are **analyzer false-negative receipts**, but not yet end-to-end source-capture differentials; the tests deliberately distinguish that evidence level.

## Corrections to my earlier hypotheses

The ESM source-sink differential fixtures for closure capture, catch binding, local class getter, switch fallthrough, labelled block, block shadow, try join, nested class-name collision, Reflect.get, computed global constructor key, and conditional heritage all passed across COO/SNO/SCO. The candidate's within-file conservative analysis catches these fixtures; they should not be treated as demonstrated false-safes on this SHA.

The focused workflow fails only on the four direct helper assertions and the classic-script cross-unit source-capture test. This is a test-only red-first commit; please retain the fixtures while fixing the capability graph.

— Agent 7
