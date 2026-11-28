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

## Follow-up: disjunctive may-alias is not definite alias (02:06–02:08 UTC)

The earlier `joinCarrierEnvironments` extension at `07ffa2b39c0f82a62a7885889c10d7faff72fb7f` physically coalesced merged containers whenever their source-side roots were aliased on *either* CFG predecessor. A representative local Node abstract-state replay showed that the original per-name pair memo had lost a feasible alias when one branch aliased `a===b` and the other did not: the native function reached a WeakMap through `b`, while the model classified `b.instance` as `other`. However the physical coalescing was itself **unsound**: a later write through `a` could erase a WeakMap reachable from `b` on the predecessor where they were distinct. That implementation was replaced, not accepted.

In production candidate `946dd5930b5d664d83c08a7be0ec8d601800088b`, each abstract `CarrierContainer` has a set of allocation `origins` preserved by branch snapshots and unioned by merges. After a CFG join, `flagPossibleCarrierAliases` recursively walks the result graph and marks **different** abstract containers whose origin sets overlap as `possibleAliases`. A possible-alias container gives a conservative `maybe` on any member lookup and cannot silently become proven ordinary merely because one alias receives a later strong update. A container/noncontainer join similarly yields `maybe` instead of dropping an allocation path into `other`. This conservative abstraction protects safety at the cost of possible false refusals; origin correlation is still only a bounded syntactic model.

Four more input witnesses were added: two feasible alias reads and two inverse nonalias-world WeakMap-retention controls, including nested child-carrier variants. Combined focused suite is now **14 new held-out cases + the original unchanged 19 = 33**. Native Node 22.16.0 prototype sanity for the four additional cases was `true` in each case. No compiler assertion is counted as green without executing its source-pinned CI.

Superseded queue pins `620f793c...` and `07ffa2b3...` were cancelled while pending. The final focused submission after these changes is [run 46096561693](https://github.com/FlareZ123/obfs/actions/runs/46096561693), exact head `b373ef1f5b6bffda74a0cffcb259fd2427474008`; **queued at report update**, no pass claim. No full-suite or acceptance run has been performed on this candidate. Ancestor source pin `07ffa...` must never be cited as a passing or sound fix.

Remaining unsoundness risks include abstract heap effects through getters, proxies, opaque closures, imported alias identities, arbitrary control transfers, exceptional edges not explicit in source, and compiler-wide interactions. Conservative `possibleAliases` may lose positive rewrite yield on realistic programs; measure before integrating. The current feature is a **source-observer compatibility experiment**, not a new confidentiality or anti-tamper boundary.

## Source-pinned isolated scanner counterfactual (02:13 UTC)

To separate the heap abstraction from full compiler behavior, I loaded **actual `src/ast.js` scanner implementations** at three immutable Git refs into the same V8 isolate, supplying semantically corresponding synthetic ESTree `Program` trees (not invoking Acorn parsing or the full obfuscator). The abstract cases both have native `Object.getPrototypeOf(right.instance)===WeakMap.prototype` on the evaluated path:

| Actual `hasWeakMapPrototypeExposure(ast)` source | Feasible shared alias, then `left.instance=new WeakMap()` | Distinct right-side WeakMap, then `left.instance={}` |
|---|---|---|
| Frozen `bf96c212...` | **false — false safe** | true |
| Physical coalescing `07ffa2b3...` | true | **false — new false safe** |
| Origin-based uncertainty `946dd593...` | true | true |

A separate ordinary no-WeakMap fixture returned `false` with frozen and origin-based scanner; direct WeakMap input returned `true` in both. Two nested-child alias variants also returned `true` under origin-based scanner. The ASTs included lexical declarations, an `IfStatement`, a later member assignment and `Object.getPrototypeOf` call, with nested source ranges; no monkeypatch of scanner logic was involved. These observations are **actual scanner-only computational witnesses**; they do not establish the full `obfuscateFiles` output, source text parity, branch effect correctness for all JavaScript, or any security claim. The reproducible real-Acorn AST fixture at `test/agent48-weakmap-origin-alias-ast.test.js` was added afterward and itself still needs source-pinned runner execution.

Crucially, the table documents that `07ffa` must not be used as a donor: simply preserving alias equality by force-coalescing all alternatives is unsound. Source-stable allocation-origin may-alias *uncertainty*, not unconditional object coalescence, is necessary to avoid both displayed false-safe families.
