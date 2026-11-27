# Bounded private class-leaf own-key proof, 23 November 2026

**Status:** isolated engineering candidate, not a release/security result. **Author:** Agent 15.
**Branch:** [`agent15/private-class-leaf-20261123`](https://github.com/FlareZ123/obfs/tree/agent15/private-class-leaf-20261123).
**Tested source:** `469106305af34d00909140454b7cc718427393c7` for the expanded 15-case suite. The exact source and parent are visible in the linked CI run.

## Motivation and proof boundary

Postmerge PR #322 correctly protects externally observable callable bodies from own-field spelling changes. This causes a loss of positive key-rewrite coverage even when a local class method is fully private. The earlier `test/private-class-source-yield.test.js` expected its own field to remain transformable.

The pilot in `src/properties.js` adds a narrow, AST-proven class leaf to the existing `privateFunctionNodes` set:

- A uniquely named, locally declared class without `extends` and with exactly one instance method; the method is noncomputed, nonstatic, synchronous, nongenerator, zero-parameter, and a single return of a statically keyed lexical owner read.
- Exactly one `const` instance construction via `new ClassName()` in the same lexical scope. Other class-name uses are declined, so the class constructor and prototype do not escape.
- The instance is used exclusively as the receiver in direct, zero-argument `instance.method()` calls. Other uses, method extraction, method source inspection, aliases, reflection, added methods, getters, constructed arguments, computed dispatch and multiple instances are declined.
- The existing root-owner proof separately verifies the object-literal own fields and their other uses. The existing whole-file and cross-file source observation vetoes remain in place. This helper **does not** admit arbitrary class fields or unsafe exported class methods.

The class binding is absent from `collectBindingScopes`, so the helper derives its nearest lexical scope from its own AST walk ancestry. The instance's existing `const` lexical scope must exactly match.

This argument is intentionally limited to the stated syntax and normal JavaScript behavior. Hostile runtime instrumentation, inspecting emitted module bytes, debugger APIs, legacy source side channels beyond the admitted grammar, and arbitrary unproved code remain outside any confidentiality guarantee.

## Reproducible controls

- Original focused 14-case branch verification at source `28424dc2d49a3def48a0493d2113b771573b7e58`: [45116033875](https://github.com/FlareZ123/obfs/actions/runs/45116033875) **passed Ubuntu and Windows**, including 3 modes and 11 independent refusal examples, project and external JSDoc checks.
- Existing two-mode private-class regression at the same source: [45116124797](https://github.com/FlareZ123/obfs/actions/runs/45116124797) **passed Ubuntu and Windows**.
- Expanded 15-case suite with source-only static-key neutralizer and real three-module ESM execution at `469106305af34d00909140454b7cc718427393c7`: [45116567663](https://github.com/FlareZ123/obfs/actions/runs/45116567663) **passed Ubuntu and Windows**, including strict project/external JSDoc. Native and emitted outputs matched in each admitted case. The positive emitted fields numbered exactly two for each compiler mode; a public-only AST attacker recovered both opaque labels and replayed equivalent outputs.

An initial ESM graph test intentionally encountered a separate global source-observer restriction: importing an unknown runtime value into arithmetic and possible function-to-string coercion conservatively vetoed every graph-wide rewrite. An identical single isolated leaf produced two transformed fields. The final cross-file test instead uses a primitive result re-export and strict numeric equality, avoiding unproved imported-value coercion. This narrows the graph claim and preserves the existing safety veto. The diagnostic branches were **red**, not ignored and not security wins.

## Interpretation and open gates

This is verified *for the finite fixtures only* as an improvement in useful property-renaming coverage while preserving known source-observation refusals. The source-only normalizer's successful key recovery is negative security evidence. No general anti-deobfuscation, environment-lock, runtime integrity, or performance claim follows. The proof emits no extra runtime interpreter, but a genuine 2.5× whole-application benchmark and an exact-head full two-OS/Chromium integration are still required before merging or calling this an integrated candidate. Current strong-protection decision remains **RELEASE-BLOCKED**.

Recommended peer review: challenge the class/instance escape proof with nested lexical scopes, getters/reentrancy, inherited prototype effects, and native source observations before integrating. Coordinate with Agent 10's PR #322 full-suite triage and Agent 3's source-preservation architecture; maintain conservative refusal if a premise is not demonstrable.

## Two-platform, timer-resolution-qualified runtime sample

A separate source-paired SNO CommonJS profile is reproducible in `sims/private-class-leaf-cost.js` and `test/private-class-leaf-cost.test.js`. It constructs one local class and owner, uses `reader.read()` and a second owned field for each hot iteration, and exports only a numeric result. Native, transformed and independently source-normalized copies are run in fresh Node 22.23.4 processes, alternating native/emitted order across seven pairs. Compiler metrics require exactly **two** own-key rewrites and the static clone has the same result.

The first [profile run 45116907418](https://github.com/FlareZ123/obfs/actions/runs/45116907418) was green, but Windows `process.cpuUsage` yielded zero microseconds for short sessions and even a 5-million-iteration loop, making those raw CPU ratios unsuitable. The harness was corrected to qualify CPU ratios only where **both** medians are at least 32,000 microseconds and to increase sustained work to **200 million iterations**. Smaller CPU samples are reported as `null`; only whole-process wall ratios are assessed there.

Corrected, [two-OS run 45117072221](https://github.com/FlareZ123/obfs/actions/runs/45117072221) at executable source `eaa5769fb1bfe046ed7a7986ef2dfcd0fa7977e1` passed focused tests and strict project/external JSDoc:

| Platform | 200M native CPU | 200M emitted CPU | Hot CPU ratio | Whole-process ratio |
| --- | ---: | ---: | ---: | ---: |
| Ubuntu Node 22.23.4 | 167,264 μs | 165,477 μs | **0.989316×** | **0.998043×** |
| Windows Node 22.23.4 | 188,000 μs | 202,000 μs | **1.074468×** | **0.987452×** |

The corrected cold one-iteration and 100,000-iteration whole-process ratios were Ubuntu 1.023627× / 1.015284× and Windows 1.018645× / 0.972483×. Their CPU ratios are intentionally unqualified due timer granularity. Each row reports the median of seven native/emitted fresh-process timings; these ratios are **finite workload observations** and do not prove a universal 2.5× ceiling or any hostile-instrumentation security advantage.

## Private nested scope, exported wrapper and genuine Chromium

The isolated compiler also passed the two follow-up nested-lexical tests in [run 45117292484](https://github.com/FlareZ123/obfs/actions/runs/45117292484) at `4bbc0f380e07e9bc9abfd058c2b3f6039e86dab4`, on Ubuntu and Windows with both strict JSDoc checks. A direct-call-only enclosing function retained two private own-field rewrites. Exporting the enclosing function for `Function.prototype.toString` observation instead produced zero property rewrites and exact native/emitted callable source. These are distinct controls for the class lexical-scope helper.

The network-served Chromium test `test/private-class-leaf-browser.test.js` at `f188d55b973df9a7f8413f74dc2aff4b8d39cfad`, [focused run 45117445579](https://github.com/FlareZ123/obfs/actions/runs/45117445579), passed on Ubuntu with true headless Chrome and project/external JSDoc, and skipped browser runtime on Windows while still passing its JSDoc checks. For each of two cases (private owner and externally visible method), it imported native, emitted and source-only-normalized ESM over a temporary HTTP server. Private case: exactly two rewritten keys, outputs all `30`, and two source-only normalized labels. Exposed-method case: zero rewritten fields and exact `Function.prototype.toString` equality from the browser host. The browser receipts establish this fixture's behavior on Ubuntu Chrome, not general browser compatibility, live-server SCO integrity or universal resistance to instrumentation.

## Independent receivers and anonymous class-expression admission

The initial singleton limitation was strengthened to any finite number of **independently constructed, const-bound local receivers**, each constructed via a direct zero-argument `new Reader()` within the class's lexical scope. The class name can occur only in those verified constructions, while each receiver can occur only in direct zero-argument `receiver.read()` calls. If any receiver or its method escapes, all owner-field rewriting is refused. The method still has the same restricted pure static read-return grammar, and inherited constructors/custom setters remain excluded by the no-`extends`/single-method class gate.

We also support an **anonymous class expression assigned directly to a uniquely bound `const`**, e.g. `const Reader=class{read(){return owner.field;}}`. Named class expressions, mutable class bindings, exported class values, and any use of the class value other than proved construction are refused. This is implemented in the same `locallyPrivateClassMethods` AST inventory and its cached method set; the existing root-owner and source-observation proof remains authoritative.

- Two-receiver focused regression and independent instance/method escape controls: [45117653790](https://github.com/FlareZ123/obfs/actions/runs/45117653790), both Ubuntu/Windows **green**.
- True Chromium two-receiver ESM output, native/emitted/public-normalized equality and exported method source refusal: [45117774457](https://github.com/FlareZ123/obfs/actions/runs/45117774457), **Ubuntu browser green**, Windows skip and strict JSDoc green.
- Reprofiled 200-million iteration **two-receiver** hot workload: [45117778489](https://github.com/FlareZ123/obfs/actions/runs/45117778489), Ubuntu 1.000106× and Windows 1.059761× CPU, Ubuntu 1.008130× and Windows 1.017458× full-process wall. Seven paired native/emitted samples, 32 ms CPU resolution gate, public-only clone equality; both OS and strict JSDoc **green**.
- Named/mutable/external-source class-expression refusal plus anonymous class-expression positive across SCO/COO/SNO: [45118045141](https://github.com/FlareZ123/obfs/actions/runs/45118045141) at source `8dcb773b70eaf5e262a8a221f62f050dc866e8de`, both OS and strict JSDoc **green**. The predecessor `45117970939` had 22/22 behavior tests pass but failed TS18047 on a potentially null AST parent; that typing problem was corrected, and no failed job is treated as green.

## Deterministic source-only differential matrix

`test/private-class-leaf-fuzz.test.js` builds 32 positive cases varying declaration/anonymous class-expression form, one to three instances, direct-return named/computed owner keys, and top-level versus direct private enclosing function. For each of COO/SNO/SCO, the test requires exactly **two actual key rewrites**, native/emitted output equality, exactly two source-only normalized labels and public clone equality. The same file constructs 28 deliberately unsupported or source-observable patterns, covering aliases, instance exports, computed dispatch, `.toString()`, named/mutable class expressions, inheritance, method statement/parameter changes, constructor arguments, partial receiver escape, prototype reflection, inline construction, and detached calls. All 84 negative mode-cases require zero rewrites and exact native/emitted results.

The [two-platform source-pinned run 45118286953](https://github.com/FlareZ123/obfs/actions/runs/45118286953) at `7edf5c4e44992d230551febc4920278e95cf395b` passed **96 positive mode-cases, 84 refusal mode-cases, 192 actual property rewrites and 192 public attacker label recoveries** on both Ubuntu and Windows, with project and external JSDoc green. This is a finite generated grammar matrix, not a soundness proof over arbitrary ECMAScript or a resistance claim against an attacker with source/runtime control.

## Language-semantics basis for the source boundary

The [ECMAScript 2026 strict-mode rules](https://tc39.es/ecma262/2026/multipage/ecmascript-language-source-code.html#sec-strict-mode-code) state that all parts of a class declaration or class expression execute as strict code, including a method embedded in an otherwise sloppy CommonJS module. This is relevant because the legacy non-strict `Function#caller` source-observation avenue used in separate function/IIFE tests does not apply equivalently to a class method. The helper still refuses direct method exposure independently of strictness.

The [ECMAScript 2026 `Function.prototype.toString` operation](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) can return the exact `[[SourceText]]` for a source-backed callable. Therefore a transformed method is *source-observable* whenever a class/method/receiver reference reaches an unproved consumer. The escaped-class, exported-wrapper, extracted-method, prototype reflection and Chromium controls deliberately force zero owner-key rewrites. Strict method code does not itself hide the source from a debugger, a copied module file or an explicit observer with a reachable callable; no such confidentiality claim is made.

### Source-sensitive dynamic-scope negative expansion

The finite refusal matrix was extended with two distinct source-visibility controls: direct `eval("Reader.prototype.read.toString()")` and a sloppy enclosing `with({})` block. These deliberately exercise the existing `dynamicScope` veto. On exact updated source `579eedb207b2ee5a8c658068484f1d6e34a012a7`, focused [run 45118918822](https://github.com/FlareZ123/obfs/actions/runs/45118918822) **passed Ubuntu and Windows** with strict project/external JSDoc: 32 positive ×3=96 mode cases with 192 rewrites and 192 public reconstructions, and 32 refusals ×3=96 mode cases with zero rewritten fields and exact native/emitted parity. The full 192-mode-case matrix remains a finite syntax-generator test and does not assert general source privacy.


## 23 November current-main forward-port and source-visibility cross-check

The original 05:39 UTC isolated branch had diverged by 1,485 mainline commits by the next invocation. Agent 15 claimed a new identity incarnation with immutable lease at 19:17 UTC and recomputed an exact source delta before porting: removing the private-class helper and restoring the original `privateFunctionNodes` line from old `src/properties.js` yielded byte-identical current-main source. Reapplying the same delta yielded the identical old candidate compiler bytes. This confirms the ported implementation's provenance, while full-repository integration remains a separate validation question.

New current-main-based branch: [`agent15/private-class-leaf-mainline-20261123`](https://github.com/FlareZ123/obfs/tree/agent15/private-class-leaf-mainline-20261123). Initial compiler/test commit: `86525da733aecafe3a46eae703a44f1e290d3712` (base `45b9db8499178dea1b1d99216dbd5607918b8828`). All three independently dispatched focused workflows completed green at the same source, each running on Ubuntu and Windows with project/external/paired-budget JSDoc gates: [property proof 45248517872](https://github.com/FlareZ123/obfs/actions/runs/45248517872), [generated 288-mode-case matrix 45248525445](https://github.com/FlareZ123/obfs/actions/runs/45248525445), [real-Chromium browser 45248535331](https://github.com/FlareZ123/obfs/actions/runs/45248535331). The Chromium execution occurs on Ubuntu; Windows skips the actual browser subtest. None constitutes a current-source full regression receipt.

A new exact-source negative witness compiles *two separately served classic scripts*, with the first declaring a class and executing its method and the second later evaluating `Reader.prototype.read.toString()` in the same global lexical realm. It requires zero owner-field renames and exact native/transformed method text. This is a declared observer within the compiler's input group rather than arbitrary source observation inferred from successful arithmetic. The test also requires the native/transformed numeric result equality. Run [45248934911](https://github.com/FlareZ123/obfs/actions/runs/45248934911) at `1112bb9f964a1a049b9257ea7fecc7f8edb9d5ad` passed Ubuntu/Windows and all three strict checker steps. An earlier harness edit at `4d9bb5...` incorrectly inserted literal backslash-n separators into the VM fixture; [45248726424](https://github.com/FlareZ123/obfs/actions/runs/45248726424) was red with fixture SyntaxError on both OS; it was repaired, and only the corrected run establishes native/compiler parity.

The current-main root source observer problems discussed by Agents 1 and 3 remain open, and successful class-local checks do not accept any unrelated source observer behavior. The early-branch static key normalizer still reconstructs every admitted rewritten field; this candidate raises useful semantics-preserving field coverage without establishing incremental attacker-cost advantage over ordinary minification. Keep it isolated until full-source integration, hostile observer review and representative budget evidence are resolved.


### Exact 19:24 UTC generated matrix correction and a vacuity control

The earlier 32-positive / 28-negative count was an intermediate test state. The **actual file run at 19:24 UTC**, `test/private-class-leaf-fuzz.test.js` at `86525da733aecafe3a46eae703a44f1e290d3712`, executes 64 positive scenarios × 3 modes = **192 positive mode cases**, each with two own-key rewrites, and 32 refused scenarios × 3 modes = **96 refused mode cases**. The source-pinned [Ubuntu job](https://github.com/FlareZ123/obfs/actions/runs/45248525445) printed `CLASS_LEAF_FUZZ_POSITIVE {"scenarios":64,"modeCases":192,"rewrites":384,"attackerRecovered":384}` and `CLASS_LEAF_FUZZ_REFUSAL {"scenarios":32,"modeCases":96,"refusals":96}`; both platforms passed. Thus the **current matrix denominator is 288 mode cases, 384 actual rewrites, 384 public key recoveries**. Prior 192-rewrite figures in this historical narrative refer to earlier source pins; do not project those counts onto the ported candidate.

A separate 12-method source-observation reconnaissance on isolated `agent15/classic-class-source-matrix-20261123` probes direct method `toString`, String coercion, Array join, descriptors, Reflect.get/Reflect.apply, aliases, JSON replacer and indirect eval across two classic scripts. Crucial **anti-vacuity finding**: its unobserved global-lexical-class control also rewrites **zero** owner keys. This is **vacuous with respect to property-source analysis** because `src/core.js` unconditionally excludes `sourceType:'script'` from local property renaming. The zero-rewrite outcome follows from the script-mode gate regardless of method visibility; the 12 refusal checks do not isolate the new local-private-class proof. Treat the matrix as a scope-control diagnostic, not extra candidate positive evidence or strengthened reconstruction resistance. New work should demand at least one demonstrable private field rewrite on the same source family before crediting new coverage.


### Current-main 200-million-iteration source-paired budget sample

At exact `1112bb9f964a1a049b9257ea7fecc7f8edb9d5ad`, [focused run 45249162776](https://github.com/FlareZ123/obfs/actions/runs/45249162776) passed Linux and Windows JSDoc plus seven-pair native/emitted fresh-Node runtime profile with two actual private-field renames and independent public-only clone parity. For the sustained 200,000,000-iteration row, CPU (not whole-process wall) **Linux 0.999251×** from 201,611 / 201,460 microseconds native/emitted, **Windows 0.936090×** from 266,000 / 249,000 microseconds. Whole process wall was **0.999790× Linux** and **1.001437× Windows**. All are sample medians and exclude claimed generalized hostile-Node slowdown. The one-event and 100,000-iteration CPU readings were below 32ms, therefore explicitly unqualified; whole-process wall ratios were 0.992141 / 1.097335 Linux and 0.986965 / 0.970311 Windows respectively. Original and emitted results matched, and all static-normalizer replay outputs matched. The diagnostic covers one local owner and class leaf, not general apps.


### Exact-parent comprehensive A/B (both OS, 23 November, 19:28-19:44 UTC)

The first comprehensive current-main-source candidate [45249199477](https://github.com/FlareZ123/obfs/actions/runs/45249199477) at `1112bb9f964a1a049b9257ea7fecc7f8edb9d5ad` **failed 15 tests on both Ubuntu and Windows**. To distinguish existing mainline failures from new regressions, Agent 15 created a control branch at the exact main ancestor `45b9db8499178dea1b1d99216dbd5607918b8828` and dispatched the **same comprehensive workflow**, [45251099540](https://github.com/FlareZ123/obfs/actions/runs/45251099540). That parent baseline **failed 17 tests on each platform**. Inspection of each run's GitHub Actions MCP `FAILED_TEST_INDEX` yields an exact set relation by test case name: the candidate's 15 failures are identical to 15 of the parent's 17 failures; the two parent-only failures are:

- `coo private direct-use class preserves value and permits private owner rename`
- `sno private direct-use class preserves value and permits private owner rename`

No new failing case was observed in the candidate's comprehensive test index on either operating system. This is credible **two-regression compatibility coverage recovery**, resolving the pre-existing `test/private-class-source-yield.test.js` expectations, within the finite current-main full suite. It does **not** turn the red workflow green and does not resolve the other 15 baseline coverage failures; release remains **BLOCKED**. The baseline and candidate were source-pinned independent full workflows, avoiding a moving-main or stale-branch comparison.

An attempted branch-only reuse of `collectProofInventory(ast)` in `src/properties.js` at `d846fa7d...` was voluntarily reverted at `6da6383d...` after reviewing its existing WeakMap cache; an apparent redundant AST traversal was actually an inexpensive cache hit. The accepted private-class compiler source remains byte-identical to the original 05:39 candidate. Do not count the reverted microchange as performance progress.


### Replacement for vacuous classic-script source control: genuine ESM source escape

At candidate test source `1ecb035a0a8e1fadb0869cad39bef491f20d73bf`, [focused run 45252189209](https://github.com/FlareZ123/obfs/actions/runs/45252189209) **passed Ubuntu and Windows with all strict JSDoc steps**. The revised `test/private-class-leaf-proof.test.js` removes the prior classic-script observer check (which could never induce a property transform due the unconditional script-mode gate). In a genuine two-file ESM process graph, all SCO/COO/SNO modes now compare native, emitted and independently source-normalized output for three same-owner fixtures:

| ESM state-module boundary | Required own-key transforms | Observation |
| --- | ---: | --- |
| Exports a precomputed primitive numeric snapshot; class and method stay private | **2** | Numeric result preserved and both public private-key labels reconstructed |
| Exports the class's instance method via `Reader.prototype.read` | **0** | Importer calls `method.toString()`; exact original function source preserved |
| Exports an accessor closure returning `Reader.prototype.read` | **0** | Importer coerces `obtainMethod()` with `String`; exact original source preserved |

The positive/negative contrast is scoped to real ESM boundaries, with no `script`-mode no-op. It exercises an actual two-key rewrite that disappears when an intentional source-visible escape is introduced. This remains a finite source-preservation test: it does not establish hostile-runtime secrecy, generic callback source-flow completeness, or field-name resistance to offline static analysis.


### Experimental private-class Symbol fields: correctness, static recovery, CPU (23 November 19:50-20:00 UTC)

The bounded `proveLocalObject` class-method admission is reused by the existing optional `experimentalSymbolKeys:true` backend. On a source-private CJS class reading an inert own-key and exposing only a numeric result, it replaces both original string-labeled fields with separately allocated native `Symbol()` keys, including their matching method and direct reads. Cases for SCO/COO/SNO modes all require **two actual Symbol-key substitutions**. Visible `Reader.prototype.read.toString()` behavior triggers **zero** substitutions, preserving the original method source. Source-pinned pilot [45252912210](https://github.com/FlareZ123/obfs/actions/runs/45252912210) green Ubuntu/Windows with strict checks, test `test/private-class-symbol-proof.test.js`.

The public-source-only `sims/symbol-key-static-recover.js` attack extracts the injected `const _sk_*=Symbol()` bindings and consistently substitutes unique string keys at static computed access sites, **without build seed, original source, or runtime instrumentation**. On the same private-class code it reconstructs **2 of 2** Symbol fields and preserves emitted/native behavior in each mode, proven by [45253691286](https://github.com/FlareZ123/obfs/actions/runs/45253691286) on both OS. This proves **functional program cloning**; it does not recover original private spellings, which are irrelevant to a source-only behavioral replica. It is a negative result for claims of strong static deobfuscation resistance.

Real headless Chromium loaded three independently served ESM program variants: two own-string-field private method reads, a visibly exported method whose `Function#toString` source must stay exact, and a new two-private-`Symbol()`-field graph. Native, emitted, and *independently public-source-recovered* copies agree. Real Chrome on Ubuntu with Windows JSDoc passed first [45253272993](https://github.com/FlareZ123/obfs/actions/runs/45253272993), then with the stronger actual Symbol recovery [45253914445](https://github.com/FlareZ123/obfs/actions/runs/45253914445). Browser test `test/private-class-leaf-browser.test.js`.

Source-paired seven-alternating-fresh-process Node 22.23.4 budget sample, [45253428222](https://github.com/FlareZ123/obfs/actions/runs/45253428222), `sims/private-class-symbol-cost.js`:

| 200M loop metric | Linux emitted/native | Windows emitted/native |
| --- | ---: | ---: |
| Measured process CPU | **1.001013×** | **1.000000×** |
| Whole-process wall | **1.000133×** | **1.050228×** |

One-event and 100K CPU durations were below the defensible 32ms threshold, so those rows only qualify whole-process wall (all four 0.986-1.027×). The tested graph emits 2 Symbols and uses a trusted native `Symbol` constructor in a fresh Node process. Under the stated SCO/COO/SNO hostile runtime models, an attacker can intercept or change that constructor and reconstruct a functional clone. The sampled ratio is not a universal 2.5× guarantee, and browser runtime latency was not benchmarked. Keep Symbol lowering experimental.


### Declarative host-lock ordering with private-class Symbols

Independent two-platform [focused workflow 45254721233](https://github.com/FlareZ123/obfs/actions/runs/45254721233) passed `test/private-class-symbol-host-lock.test.js` on the isolated pilot source. A genuinely executed Node ESM module has a private class reading two private owner keys, a guarded numeric export, and a declared side-effect log. Offline SCO/COO builds with `experimentalSymbolKeys:true`, `closedWorld:true` and `allowedHosts:['allowed.example']` each emit **two Symbol substitutions** and a browser-like hostname guard. On authorized `allowed.example`, the emitted module preserves the original result `30` and the `['read']` effect log. On denied `denied.example`, the test installs a recording but native-semantics-preserving Proxy over `Symbol` before dynamic import; compilation's emitted module produces an unauthorized-host error, **zero application effects**, and **zero generated Symbol constructor invocations**. Thus the *syntax-level guard executes before generated Symbol initializers* for this narrow single-file ESM graph. This is an execution-order/compatibility result. It does not establish a tamper-proof authorization boundary: an attacker who controls the realm, module text or `location` can bypass the hostname check, and the trusted native Symbol requirement still applies to authorized semantics.


## 23 November evidence-based decision matrix (draft-only)

This assessment is **specific to the bounded private-class leaf proof, its string-key renaming, and optional native Symbol-key backend**. Do not generalize to the complete JavaScript obfuscator. A true attacker in the prompt can obtain the output, instrument its runtime, and inspect all legitimate responses.

| Independent dimension | Evidence and scope | Decision |
| --- | --- | --- |
| Static reconstruction | 384/384 positive literal own-key rewrites normalized from public output in 64 cases × 3 modes; 2/2 native Symbol private-key paths independently converted into working public-source-only clones; real Chromium clone parity | **Behavioral clone not resisted in this family**; native source spelling may stay unavailable but functional dataflow is recoverable |
| Dynamic instrumentation and extraction | A hostile runtime can instrument global `Symbol` before generated initializers, as existing `test/symbol-key-static-recovery.test.js` demonstrates; generated values are reachable in same realm | **No instrumented-runtime secrecy claim** |
| Unauthorized modification or integrity bypass | No new trusted or cryptographically authenticated runtime, manifest, or protected remote computation is introduced by this property pass | **Tamper resistance not established**; changing emitted source or runtime remains available under SCO/COO/SNO attacker assumptions |
| Execution outside authorized host | Single ESM host-lock control runs guard before Symbol initializers and program effects; authorized/denied behavior preserved in Node 22 | **Syntactic location guard passes finite tests; hostile runtime or location spoof remains outside this security guarantee** |
| Runtime 2.5× and compatibility | Seven-pair fresh Node 200M CPU: literal keys Linux 0.999251× / Windows 0.936090×; Symbol keys Linux 1.001013× / Windows 1.000000×. Whole-process wall 0.999790×/1.001437× literals and 1.000133×/1.050228× Symbols. Two-OS parent full-suite 17 red versus candidate 15 red, exactly 2 repaired class tests and zero new failures | **Sampled hot/whole budget passes; no universal ratio guarantee. Compatibility improved in tested cohort, full suite remains red** |

**Combined recommendation:** retain [draft PR #345](https://github.com/FlareZ123/obfs/pull/345) as a reviewed compatibility/coverage candidate. Its measured semantics and limited runtime cost improve the attainable performance/coverage frontier but do **not** independently increase justified static/dynamic attacker-work claims. Keep the repository-wide release **BLOCKED**. Before stronger security claims, require independently validated attacker-cost evidence on actual public output, broader hostile environment tests, and full-suite reconciliation.
