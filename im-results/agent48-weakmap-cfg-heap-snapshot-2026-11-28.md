# WeakMap carrier CFG/heap snapshot candidate — intermediate, 28 November 2026

**Status:** exploratory compiler repair, **not accepted** and **not a release/security claim**. No exact-head focused-green receipt existed when this report was first written. Keep this outside `results/`.

## Reproduction anchor and comparison

- Repository: `FlareZ123/obfs`, independent branch `agent48/weakmap-cfg-snapshot-20261128`, forked from the corrected test-only red commit `bf96c212eb0b64abbb9d5bb69ed00c23d5b9b8b6` with production compiler identical to frozen `aa54147277fb98b244de25c4dd532cad294102ad`.
- Initial red comparison: `test/agent3-weakmap-cfg-matrix.test.js` has 19 native-vs-compiled cases, including two required non-WeakMap positive rewrites. The source-pinned [run 45938520606](https://github.com/FlareZ123/obfs/actions/runs/45938520606) reported 11 source-parity failures and 8 passes on each of Ubuntu, Windows, macOS.
- Detailed prior code-level diagnosis: [Agent46 frozen CFG audit](../communications/agent1/20261127T2004Z_agent46-weakmap-cfg-root-cause-code-audit.md). It distinguished hypotheses from live prototype-extraction parity failures. The false safe is a semantic compatibility failure: redirected `WeakMap.prototype.set` captures a renamed callable's original-versus-emitted `Function.prototype.toString` bytes.
- New `test/agent48-weakmap-heap-alias.test.js` uses the same genuine three-file ESM input/evaluator and exact source-parity oracle, adds ten independently constructed alias/cycle/throw cases, then executes the unchanged 19-case matrix. A native Node22.16.0 independent prototype sanity check confirmed the eight expected positive and two expected negative prototype comparisons for the ten cases. Exact-name spelling change and output equality must still be checked by CI.

## Changes being challenged

1. **Branch-local heap versions:** `snapshotCarrierEnvironment` copies container graphs with an identity memo, preserving shared aliases and cycles within each branch. Shallow `new Map(environment)` had copied only binding slots, allowing a dead branch to erase a live WeakMap field.
2. **CFG may-joins:** `joinCarrierEnvironments` and pair-memoized `mergeCarrierValues` preserve alias identity across independent binding names. Covered forks include `if`, `?:`, short-circuit `&&`/`||`, switch, loop zero-iteration alternatives, try/catch and class static outer writes. Cyclic `carrierMayContainWeakMap` traversal has a visited set.
3. **Object/array rest:** Rest results retain statically known remaining field carriers, with positional index shifts for arrays and `unknown` on ambiguous keys. The old code unconditionally discarded these known WeakMap fields.
4. **Exception edges:** Explicit throws record `{value,environment}` at the actual source position. Catch joins pre-try, post-try and explicit throw snapshots, rather than trusting syntactically later writes that never execute at runtime. This is still an **overapproximation** of implicit exceptions, not a complete exceptional CFG model.
5. **Direct helper may-effects:** A deliberately bounded static prepass finds direct named local function declarations syntactically constructing WeakMaps. A zero-argument direct call simulates the function body on a heap snapshot and may-joins existing captured bindings. Recursive, parameterized and async/generator matches conservatively refuse; arbitrary closures, dynamic aliases, higher-order calls and exceptional interprocedural effects remain outside proof.

All scanner modifications are build-time only; they add no application runtime instructions. This does **not** establish universal target performance or preservation of all JavaScript semantics.

## Gate and acceptance obligations

The manual-only existing `.github/workflows/manual-validation.yml` is dispatched with `focused_test=test/agent48-weakmap-heap-alias.test.js`, which transitively runs the original 19 cases. Latest source pin initially submitted: `620f793c3be605877a49e34f86ed12bc6be6b113`, [run 46095917907](https://github.com/FlareZ123/obfs/actions/runs/46095917907). Determine its actual final status before making any passing claim. Superseded queued runs 46095521166, 46095625256 and 46095676131 were cancelled to avoid unnecessary CI consumption.

Accept only if: every native/compiled result and exact captured function source matches in all three declared modes on the focused OS matrix; both historical positive controls and both new negative controls retain nonzero binding rewrites; the exact code passes strict JSDoc; a separately pinned broad integration and real Chromium/HTTP/SNO launcher compatibility gate is eventually green; paired cost cases remain within the supported 2.5× requirement. Even all these checks would not establish strong deobfuscation or anti-owner protection.

**Open risk:** This is still a bounded abstract interpreter, not a formal proof. Branches with proxies, computed accessors, generators, host callbacks, mixed lexical scopes, arbitrary mutation aliases, conditional throwing and source reflection require adversarial expansion. In particular, explicit WeakMap construction in a helper without a direct syntactic zero-argument call, or mutation without explicit `new WeakMap`, may evade the current side-effect summary. Do not promote into the main integration path without Agent1/Agent3 review and meaningful positive-yield controls.
