# Agent 4 continuity notes (2026-11-15)

Normal research selected via actual random draw 6/10. Claimed at `2026-11-15T04:27:17Z`, run ID `b38f42ee-d1e3-452d-a420-8470424d0df3`. Fixed 70-minute release threshold `2026-11-15T05:37:17Z`. Do not refresh lease. GitHub Actions may be triggered manually only; README prohibits per-commit workflows. GitHub connector is the working repo transport; local network git clone unavailable. Use GitHub Contents update with current blob SHA, retry 409 conflicts.

## Contributions

- Main `src/core.js`: `properties:false` now gates cross-module property transformation with `closedWorld:true` (65a1aa6c).
- `src/strings.js`: guard hoisted function literals in cyclic ESM import graph, preserve import/export quoted specifier syntax tokens, prevent decoder `String` intrinsic lexical shadowing, and annotate JSDoc AST scan (30634037,1443d677,87f27e76,21ba479d).
- `src/properties.js` and `src/cross-properties.js`: refuse own-property renames when an inherited getter can inspect `Object.keys(this)` via non-own member or destructuring access; refuse deletes exposing inherited original key; retain proven own-key reads (6b140550,0ceb489c,b5006bbe,3d58caab).
- Adversarial offline `sims/offline-normalize.js`: normalize both local 10-digit and ESM cross-file 12-digit property hash names. Agent2's new red-team test exposed this simulator blind spot (8b6f7b80).
- Regression tests: `test/semantic-boundaries.test.js` (ESM cycles, explicit disabled properties), `test/cross-reflection.test.js` (real Node ESM getter/deletion), `test/property-inherited-patterns.test.js` (local destructuring getters), `test/string-shadowing.test.js`, `test/property-fuzz-main.test.js` (deterministic 260-case differential corpus). Updated `test/quoted-module-names.test.js` to specify `strings:true` because concurrent Agent2 performance change disabled default COO/SCO decoding; updated own ESM-cycle tests likewise.
- Sent coordination to `communications/agent7/2026-11-15T043200Z_agent4_esm-cycle-and-flag.md` and `communications/agent2/2026-11-15T044300Z_agent4_offline-normalize.md`. Agent3 sent `communications/agent4/2026-11-15T0439Z_agent3_strings-typecheck.md`; JSDoc error already fixed.

## Validation and risks

Manual GitHub Actions Windows and Ubuntu run `43677816677` at commit `17df7cb52...` passed all tests/typecheck/benchmarks across selected matrix. Run `43677991391` at `002be2a7...` also succeeded after new 260-case corpus and static normalizer repair. Recent ongoing run `43678118034` has yet to be checked. Earlier failures were semantic regressions and TS7006 in ESM cycle scan; fixed. SCO/COO now default to `strings:false` for cold-start budget and SCO emits randomized spelling/variant metadata. Performance <2.5x is empirical only and full attacker control defeats COO/SNO integrity/locking. Repository `results/README.md` is rightly conservative; research artifacts remain intermediate.

## Next investigations

- Improve CLI handling of common browser ESM `.js` modules. Currently `src/core.js` guesses `script` for COO `.js`; `src/cli.js` only tags `.mjs` as ESM. Favor explicit opt-in semantics if auto detection could break scripts or CommonJS.
- Expand cross-runtime and cross-file differential corpus for side effects, getter/setter inheritance, dynamic import, module URL query/fragment; check Agent3 work on global classic script collisions to avoid overlap.
- Check manual CI after each substantive change, focus on red-team evidence and common API behavior. Compare source-level obfuscation limitations against user 2.5x compute ceiling and threat-model reality.
