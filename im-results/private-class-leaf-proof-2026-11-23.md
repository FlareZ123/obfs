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
