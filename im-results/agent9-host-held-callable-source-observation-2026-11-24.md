# Host-held callable source observation escapes identifier and string transforms

**Status:** Intermediate empirical finding; not an established release result.  
**Owner:** Agent 9  
**Date:** 2026-11-24T04:14:23.926Z  
**Current-main compiler source pin:** verified at witness commit `8b255e22e439464ed5517c07bc14b227bf549c42` and compared byte-for-byte by Git blob SHA with current `main`.

## Summary

A host can observe the exact source of a private function simply by receiving it as an argument. The host need not invoke the callback, so no active stack frame exists. On current `main`, the local property proof conservatively retains the property spelling visible in the callback, but identifier renaming and string encoding still rewrite the callback's source in both COO and SNO.

This is a source-semantics preservation defect and a concrete justification for a shared HostHeldCallable effect/value-flow closure consumed by every transformation pass.

## Reproduction

Test-only branch: [`agent9/host-held-callable-source-20261124`](https://github.com/FlareZ123/obfs/tree/agent9/host-held-callable-source-20261124)  
Witness commit: `8b255e22e439464ed5517c07bc14b227bf549c42`

- Positive property control: [`test/agent9-host-held-callable-source.test.js`](https://github.com/FlareZ123/obfs/blob/agent9/host-held-callable-source-20261124/test/agent9-host-held-callable-source.test.js)
- Identifier/string red controls: [`test/agent9-host-held-callable-transform-closure.test.js`](https://github.com/FlareZ123/obfs/blob/agent9/host-held-callable-source-20261124/test/agent9-host-held-callable-transform-closure.test.js)
- Focused run: [45324800972](https://github.com/FlareZ123/obfs/actions/runs/45324800972), both Ubuntu and Windows, Node.js 22.23.4. All four red-control tests passed by observing the source mismatch; project, external and paired-budget JSDoc checks passed.
- Positive control run: [45324507606](https://github.com/FlareZ123/obfs/actions/runs/45324507606), both Ubuntu and Windows, Node.js 22.23.4. COO and SNO host-held property controls and JSDoc checks passed.
- Earlier ESM COO control: [45324199129](https://github.com/FlareZ123/obfs/actions/runs/45324199129).

The harness injects a host-realm `queueMicrotask` function into a VM context. It calls `Function.prototype.toString.call(callback)`, stores the result, and never invokes the callback. The host therefore observes a callable value without an ActiveFrame edge.

## Current-main source identity

All six relevant compiler blobs at witness commit and current `main` were identical:

| File | Blob SHA |
|---|---|
| `src/ast.js` | `c227e6e604635a42663af745fd0cfb194b215a67` |
| `src/properties.js` | `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c` |
| `src/identifiers.js` | `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f` |
| `src/strings.js` | `df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6` |
| `src/core.js` | `8d33996821650de540b87502baff00a9e7ea99c7` |
| `src/sco.js` | `c8f98b553172426559b21abaf0dc9a4fc3ea068e` |

No compiler implementation changes were included in the branch.

## Observations

### 1. Property transformation is locally conservative

For both COO and SNO, the positive control passes:

- The property read by the host-held callback remains spelled `secretField` in the function source.
- An unrelated proven private property `unrelatedField` is still renamed.
- The host never invokes the callback.

This demonstrates selective local property-proof rejection rather than a file-wide no-op.

### 2. Identifier transformation leaks callback source

Native source:

```js
function hidden(inputValue){return inputValue+1;}
```

Current-main emitted source:

```js
function hidden(_v96170827ead6){return _v96170827ead6+1;}
```

COO metrics: `bindings: 1`.

SNO likewise renames the parameter to `_vee5afd5e3004`.

### 3. String transformation leaks callback source

Native source:

```js
function hidden(){return 'callbackSourceLiteral';}
```

Current-main emitted source in COO:

```js
function hidden(){return _o62e340454284[0];}
```

SNO likewise emits a generated decoder lookup. Both modes report `literals: 2` because the test also contains an unrelated top-level string. The module's executable value remains unchanged.

## Interpretation

The property pass and the identifier/string passes do not consume a common source-observation fact:

- The local property proof sees a function reference passed as an unknown call argument and declines the owner proof.
- `renameLocalIdentifiers` gates on `observesFunctionSource(ast)`, which does not currently classify this unknown host-held callback argument as a source observer.
- `encodeStrings` uses the same observer predicate and rewrites string literals inside the callback source.

The result is an inconsistent safety boundary: property names remain stable, while formal-parameter and literal spellings in the same observed function change.

The shared SourceObservationPlan should represent a callsite-qualified HostHeldCallable/value-observation edge and propagate it through actual/formal, alias, return and object-field flows. Every source-mutating pass must consume the resulting callable source closure. This is distinct from ActiveFrame: the host observes the callback before any invocation, and it may never invoke it.

## Scope and unresolved work

This is a focused direct-argument Node VM witness, not a full language proof:

- It now covers compiler API modes COO, SCO and SNO, plus one end-to-end `createScoHandler` source-delivery case.
- The actual SCO handler witness uses a Node client harness, not Chromium; it validates server-delivered module output and a client-controlled host override, not browser-specific host APIs.
- Same-file direct, alias, object-field, parameter-forward and returned-callback paths are covered in all three compiler modes. Cross-file ESM is covered through one imported factory-return path. Spread/apply/bind, dynamic target unions, module cycles and other value-flow shapes remain open.
- It is not a browser Chromium reproduction of the exact `queueMicrotask` case. Agent 1/8 have a separate focused COO browser witness for host-overridden `Array.prototype.map`.
- It establishes a source-observation semantic mismatch, not an additional confidentiality guarantee. COO and SNO threat models already grant the attacker broad source/runtime access.
- No performance measurements or 2.5× budget conclusions are implied.

## Recommended next action

Agent 3 should incorporate this as a shared-plan acceptance case: the same host-held callback must preserve function source under property, identifier and string transforms, while unrelated proven properties/strings remain eligible where the chosen closure permits. Agent 10 should include the direct non-invoking host-held callable case in comprehensive acceptance. Do not promote this report to `results/` until the shared-plan implementation and full mode-specific suite resolve it.


## Local property-proof value-flow matrix

A follow-up diagnostic expanded the positive property control to five callback handoff forms in both COO and SNO:

1. direct argument: `queueMicrotask(hidden)`;
2. alias assignment: `const callback = hidden; queueMicrotask(callback)`;
3. object-field storage: `const holder = { callback: hidden }; queueMicrotask(holder.callback)`;
4. actual→formal forwarding: `forward(hidden)`, where `forward(fn)` passes `fn` to the host;
5. returned callback: `getCallback()` returns `hidden`, then the result is passed to the host.

All 10 mode/path combinations preserved the exact observed callback source, retained `owner.secretField`, rewrote unrelated `other.unrelatedField`, and preserved the module result. Each emitted one property rewrite. Focused run [45325152560](https://github.com/FlareZ123/obfs/actions/runs/45325152560) passed on Ubuntu and Windows with all strict JSDoc checks.

This strengthens the interpretation: the current local property proof already handles these five *same-file* callback-value paths conservatively. The confirmed gap is cross-consumer: identifier renaming and string encoding still rewrite source-visible formals/literals of the same host-held callable. Do not generalize the property matrix to cross-file ESM, arbitrary object aliasing, spread/apply/bind, mutable dispatch or all language constructs.


## Callable source closure across five value-flow paths

The red-control suite was extended across the same five handoff paths used by the positive property matrix: direct argument, alias assignment, object-field storage, actual→formal forwarding, and returned callback. For each path it separately tested identifier renaming and string encoding in both COO and SNO: 20 combinations total.

All 20 combinations exposed changed callback source while preserving the module's executable result and never invoking the callback. Focused run [45325337541](https://github.com/FlareZ123/obfs/actions/runs/45325337541) passed 20/20 red controls on Ubuntu and Windows; project, external and paired-budget JSDoc checks passed.

Representative exact outputs:

| Consumer | Native callback source | Emitted callback source |
|---|---|---|
| Identifier | `function hidden(inputValue){return owner.secretField+inputValue;}` | `function hidden(_v2902a13e7f90){return owner.secretField+_v2902a13e7f90;}` |
| String | `function hidden(){return 'callbackSourceLiteral';}` | `function hidden(){return _o86f34a47b5cd[0];}` |

The same result occurred for direct, alias, object-field, parameter-forward and returned-callback paths in both modes. The exact generated identifiers/decoder names vary with the deterministic per-case seed.

The source blobs for `src/ast.js`, `src/properties.js`, `src/identifiers.js`, `src/strings.js`, `src/core.js` and `src/sco.js` at witness commit `55cedfa8521659dda9ed6d7181860453fcc66eb3` were again independently compared with current `main` and were identical. No compiler source was changed on the test branch.

Combined interpretation: the existing local property proof preserves source across these same five same-file paths (10/10 COO/SNO property controls in run 45325152560), while identifier and string passes rewrite the same callback source (20/20 COO/SNO red controls in run 45325337541). The gap is a transformation-consumer integration defect. It is not established that cross-file ESM, dynamic imports, every call form, or SCO has the same behavior.


## Cross-file ESM factory-return witness

A separate two-module reproduction puts the private callback definition in `helper.mjs`:

```js
function hidden(inputValue){return inputValue+1;}
export function getCallback(){return hidden;}
```

The entry module imports `getCallback`, arms a host-provided `queueMicrotask` source observer, and passes `getCallback()` to it. The host reads `Function#toString` and never invokes the returned callback.

In both COO and SNO, the imported factory-return path leaks the private callback source:
- identifier transform: `inputValue` becomes a generated parameter;
- string transform: `'callbackSourceLiteral'` becomes a generated decoder lookup.

Focused run [45325587955](https://github.com/FlareZ123/obfs/actions/runs/45325587955) passed four red controls across COO/SNO on Ubuntu and Windows with strict JSDoc. Compiler blobs at witness commit `de6867c28d9d2efee7b86e2b7fc6cd37175d3ee9` for ast, properties, identifiers, strings, core and SCO were again identical to current main.

This is direct evidence that the host-held callable value flow crosses an ESM import/export boundary and a factory return before the host observes the callable. It does not yet cover arbitrary module cycles, dynamic import, namespace objects or import-map resolution.

## Per-callable precision diagnostic

The diagnostic in `test/agent9-host-held-callable-precision.test.js` places two functions in one file:

- `hidden`, whose source is observed by the host-held callback;
- `safe`, which is never passed to the host.

Current COO and SNO behavior transforms **both** functions:
- identifier mode renames both `inputValue` and `safeValue`;
- string mode encodes both `callbackSourceLiteral` and `unrelatedLiteral`.

Focused run [45325642684](https://github.com/FlareZ123/obfs/actions/runs/45325642684) passed on Ubuntu and Windows with strict JSDoc because it asserts this current behavior. The diagnostic prints both native and emitted function source.

The desired future acceptance is different: `hidden` source must remain byte-for-byte identical, while `safe` remains eligible for identifier/string transformation. A file-wide boolean gate cannot express that. Broadening `observesFunctionSource` to every unknown host call would fix the false-negative by disabling transformations for `safe` too; leaving the current predicate narrow mutates `hidden`. This is the concrete precision requirement for per-callable semantic closures.

## Consolidated boundary

Across direct, alias, object-field, actual→formal, return and cross-file factory-return paths, the current-main implementation demonstrates source-observation leaks in identifier/string consumers in COO, SCO and SNO. The local property proof is safer for the five same-file handoff paths tested, but that does not establish cross-file property safety. The actual SCO handler delivery path also changes the private callback's formal parameter spelling in a Node client harness.


## Three-mode matrix and actual SCO handler delivery

The five same-file handoff paths were expanded to all three compiler API modes (COO, SCO, SNO):

- Property positive controls: 15/15 path/mode cases preserve the observed callback source and retain the observed owner key while renaming an unrelated private key. Run [45326018298](https://github.com/FlareZ123/obfs/actions/runs/45326018298).
- Identifier/string red controls: 30/30 path/mode/consumer cases change the observed callback source while preserving runtime values and never invoking the callback. Run [45326023443](https://github.com/FlareZ123/obfs/actions/runs/45326023443).
- Cross-file ESM factory-return red controls: 6/6 mode/consumer cases change private callback source after an imported factory returns it. Run [45326027451](https://github.com/FlareZ123/obfs/actions/runs/45326027451).
- Per-callable precision diagnostics: in all three modes, both observed `hidden` and unrelated `safe` functions are currently transformed. Run [45326031046](https://github.com/FlareZ123/obfs/actions/runs/45326031046).

Each focused run passed on Ubuntu and Windows with project, external and paired-budget JSDoc checks.

An additional test exercises the actual SCO server-delivery path through `createScoHandler`, not merely `obfuscateFiles({mode:'sco'})`. The handler serves `entry.mjs` and `helper.mjs`; the client imports `getCallback()`, arms a host-controlled `queueMicrotask`, and passes the returned private function to it. The host reads source without invoking the callback. The original source:

```js
function hidden(inputValue){return inputValue+1;}
```

is delivered as:

```js
function hidden(_v5580e2525f52){return _v5580e2525f52+1;}
```

The runtime output remains `done`; callback invocation remains false. The handler's delivered helper is only 103 bytes in this focused fixture. Run [45326162520](https://github.com/FlareZ123/obfs/actions/runs/45326162520) passed on Ubuntu and Windows with strict JSDoc.

Compiler blobs at end-to-end SCO witness commit `02e6a736a73dcddd222386c8035f57ff59f4390b` were independently verified identical to current main:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/properties.js`: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`
- `src/strings.js`: `df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6`
- `src/core.js`: `8d33996821650de540b87502baff00a9e7ea99c7`
- `src/sco.js`: `c8f98b553172426559b21abaf0dc9a4fc3ea068e`

The end-to-end SCO case specifically establishes that a client-controlled host can inspect a private callback after the SCO handler has delivered its transformed module. It does not imply the attacker can inspect code that SCO keeps exclusively server-side.


## Independent real-browser corroboration

Agent 1 independently ran a real Chromium host-held callback witness in [run 45325672865](https://github.com/FlareZ123/obfs/actions/runs/45325672865). The page replaces `queueMicrotask` with a host-owned function that captures `Function#toString` and does not invoke/schedule the callback. Chromium observed both identifier and string source changes while the test retained positive transform yield and runtime value parity. Windows browser execution was skipped; standard/external/paired-budget JSDoc checks passed.

This independently corroborates the direct host-held source mismatch in an actual browser. Agent 1's test calls the callback directly afterward for value parity; Agent 9's Node VM witnesses do not invoke the callback at all, isolating the source-observation edge from any invocation. See `communications/agent3/20261124T0422Z_agent1-host-held-source-browser.md` and `im-results/agent1-native-intrinsic-callback-browser-2026-11-24.md`.


## SCO selected-server partition boundary and source-semantics tradeoff

A separate positive boundary test exercises `partitionScoSelectedAsyncExports` plus `createScoSelectedHandler`. It selects `protectedDigest` as a server-private async export and supplies private dependency modules. The handler serves the generated client facade, while requests for `private/engine.mjs` and `private/leaf.mjs` return 404. The client host then reads `Function#toString` of the facade without invoking it.

Focused run [45326434167](https://github.com/FlareZ123/obfs/actions/runs/45326434167) succeeded. At witness commit `71f3a2461bcc0b202f1649b088125f2d8cf10ea1`, the six relevant compiler source blobs (ast, properties, identifiers, strings, core and SCO) were independently verified identical to current main.

This demonstrates the intended confidentiality boundary: the client sees a generated facade, not the server implementation or private dependency bodies. It also demonstrates a compatibility tradeoff: `Function#toString` of the facade differs from the original server function. If 1:1 source-observation semantics are required, the compiler must refuse to partition a callable whose source is observable by client code/host, or explicitly define this as an unsupported semantic change. Hiding the implementation and preserving its exact source text are mutually incompatible when the source itself is observable; sending the original source would defeat the server-only confidentiality boundary.

A follow-up version adds `verifyScoPrivateSourceDigests` before loading the private graph and removes an over-restrictive assertion about private path metadata. This validated version passed on Ubuntu and Windows with strict JSDoc in [run 45327228394](https://github.com/FlareZ123/obfs/actions/runs/45327228394). The exact test content is restored at branch commit `77594c998b026e09138dd9213a3da586bfd021ae`. A separate experiment that wrote the facade at its canonical path failed in the test harness and was reverted; it is not evidence against the partitioner.


## Callable syntax coverage and real SNO launcher

The source-mutation red controls now cover seven callable syntax forms in each of COO, SCO and SNO, for both identifier and string consumers (42 combinations): function declaration, function expression, arrow function, object method, class method, async function and generator function. All 42 tests observed changed callback source while preserving runtime values and never invoking the callback. [Run 45328404113](https://github.com/FlareZ123/obfs/actions/runs/45328404113) passed on Ubuntu and Windows with strict project/external/paired-budget JSDoc.

SNO was also exercised through its actual one-entry launcher path, not only `obfuscateFiles({mode:'sno'})` in a VM. The test compiles a single CommonJS `entry.cjs`, creates the bootloader with `createSnoLauncher`, then launches `sno-entry.cjs` under Node with a host-controlled `queueMicrotask` override. The launcher verifies the artifact manifest and `require()`s the obfuscated entry. In separate identifier and string cases, the host observes changed callback source; stdout remains `done`; the callback is never invoked. [Run 45328512061](https://github.com/FlareZ123/obfs/actions/runs/45328512061) passed on Ubuntu and Windows with all strict JSDoc checks.

The eight relevant implementation blobs at SNO launcher witness commit `0564d862a66afc77f818e57803b2bf4cab09bf04` were independently verified identical to current main:

| File | Blob SHA |
|---|---|
| `src/ast.js` | `c227e6e604635a42663af745fd0cfb194b215a67` |
| `src/properties.js` | `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c` |
| `src/identifiers.js` | `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f` |
| `src/strings.js` | `df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6` |
| `src/core.js` | `8d33996821650de540b87502baff00a9e7ea99c7` |
| `src/sno.js` | `74bac83442ac11e57bf46e822385f408ba527399` |
| `src/cli.js` | `587398dbd070a809be92098f9df678ec7e5c23d2` |
| `bin/sno.js` | `26d28904e88cfb380dc5248c1c14862352a4ae41` |

This closes the focused SNO launcher/entrypoint gap for a single CommonJS entry and direct host-held callback. It does not establish full CLI/package compatibility, multi-file SNO loader behavior, or the complete SNO hostile-runtime threat model.


## SNO command-line path (not only launcher API)

The actual `bin/sno.js` CLI was exercised with `--root`, `--out`, `--entry entry.cjs` and a deterministic seed. It emitted the SNO artifact set and `sno-entry.cjs`; the test then ran the generated single-entry launcher under Node with a host-controlled `queueMicrotask` override. The callback source parameter was changed by the default SNO identifier transform; stdout remained `done`; the host did not invoke the callback. [Run 45328981265](https://github.com/FlareZ123/obfs/actions/runs/45328981265) passed on Ubuntu and Windows with strict project/external/paired-budget JSDoc.

At witness commit `44c3d2b279638960ed52d7ab8064296352994ca3`, the implementation blobs for `src/ast.js`, `src/properties.js`, `src/identifiers.js`, `src/strings.js`, `src/core.js`, `src/sno.js`, `src/cli.js` and `bin/sno.js` were independently verified identical to current main. This is focused CLI evidence for one CommonJS entry and the default identifier pass; the explicit string-transform SNO witness remains the launcher API test in run 45328512061.


## Actual SCO handler in Chromium

The `createScoHandler` witness was extended from a Node client harness to a real Chromium client. The server delivers `entry.mjs` and `helper.mjs`; the entry imports a factory that returns private `hidden`, then passes it to a client-overridden `queueMicrotask`. The browser host records `Function#toString` and never invokes the callback. The native control observes `function hidden(inputValue){return inputValue+1;}`; the SCO-delivered module exposes a changed parameter spelling while the module loads successfully.

[Run 45329160079](https://github.com/FlareZ123/obfs/actions/runs/45329160079) succeeded. Chromium executed on Ubuntu; Windows browser execution is intentionally skipped because Chromium is provisioned only on the Ubuntu runner. Both OS jobs passed strict project/external/paired-budget JSDoc. The six relevant compiler blobs at witness commit `4e87e451192f51235b47f9fb740c62bf7b49b2d8` (ast, properties, identifiers, strings, core, SCO) were independently verified identical to current main.

This is direct browser evidence for the actual SCO server-delivery/client-execution path, including cross-file ESM factory-return and non-invoking host-held source observation.


## Callable metadata positive controls

A separate property-pass control captures all three host-observable callable dimensions: `Function#toString`, `.name`, and `.length`, without invoking the callback. It covers object methods and class methods in COO/SCO/SNO. In all six cases the exact source, name `callback`, and length `1` remain unchanged while an unrelated private object's property is renamed (one property transform per case). [Run 45329546230](https://github.com/FlareZ123/obfs/actions/runs/45329546230) passed on Ubuntu and Windows with strict JSDoc.

The initial same-owner object-method fixture (run [45329447408](https://github.com/FlareZ123/obfs/actions/runs/45329447408)) also preserved source/name/length, but produced zero property-renaming yield for an unrelated field on the same object that owns the escaping method; the test failed only because it required positive yield. The corrected positive control moved the unrelated field to a separate private owner and passed. This is evidence of conservative owner-level withholding, not yet proof that same-owner field renaming is safe. A field-sensitive analysis may be able to retain that yield, but the `[[HomeObject]]`/reflection/value-escape assumptions need explicit validation before treating it as an established opportunity.


The same-owner observation was then isolated as a passing diagnostic rather than a yield assertion: [run 45329630264](https://github.com/FlareZ123/obfs/actions/runs/45329630264) confirms in COO/SCO/SNO that the host-held method's source/name/length remain unchanged, while the unrelated `holder.unrelatedField` remains native and `metrics.properties === 0`. The separate-owner positive test in run 45329546230 still achieves one unrelated property rename per mode/method case. This empirically distinguishes a conservative same-owner veto from a global property-pass veto.


## Dynamic property access and reflection value-flow

A further matrix routes the host-held callback through three retrieval forms: computed property access `holder[key]`, `Reflect.get(holder,key)`, and `Object.getOwnPropertyDescriptor(holder,key).value`. Across COO/SCO/SNO:

- Identifier renaming changes the callback's observed source in all 9 access/mode combinations.
- String encoding conservatively preserves the callback source in all 9 combinations, but `metrics.literals === 0` even though the file contains an unrelated top-level string literal. Thus the string consumer applies a broad reflection/dynamic-access veto with zero string yield, while the identifier consumer still mutates the same host-observed callable.
- The host callback remains non-invoking in every case.

[Run 45330368625](https://github.com/FlareZ123/obfs/actions/runs/45330368625) passed 18/18 tests on Ubuntu and Windows with strict JSDoc. This is a particularly clear consumer inconsistency: conservative string gating does not protect the callback from identifier renaming. The shared plan must propagate the host-held callable through computed/reflective property-value edges and make all source-mutating consumers honor the same exact-source closure, while retaining unrelated yield where proven.


## Nested callable source-span closure

An outer host-held `outer` function contains a nested `inner` declaration. The host observes only `outer` source and never invokes it. In all three modes, identifier renaming changes both outer and nested parameter spellings, therefore changing the outer Function#toString source (3/3 red controls). The string pass preserves the complete outer source, but also skips every string in the file (`metrics.literals === 0`; even an unrelated top-level literal remains unchanged), yielding a broad file-level veto. [Run 45330456975](https://github.com/FlareZ123/obfs/actions/runs/45330456975) passed on Ubuntu and Windows with strict JSDoc.

This confirms that an observed outer callable's source closure includes nested function text. It also adds another consumer divergence: string encoding is broadly withheld while identifier renaming still edits source inside the observed outer span. The plan needs nested-span closure plus a shared per-callable consumer gate; a file-wide string veto is safe but sacrifices unrelated yield.


## Actual multi-file SNO CLI receipt (Agent 3 integration note)

The corrected Agent 9 branch test file test/agent9-sno-cli-host-held-callable.test.js was run through the existing Manual obfuscator validation workflow's focused-test input, at branch agent9/host-held-callable-source-20261124, commit 6d3d4d0b80c3932f15adf0ace5f645a5e348b980. [Run 45332042271](https://github.com/FlareZ123/obfs/actions/runs/45332042271) succeeded on Ubuntu and Windows with Node 22.23.4, strict project JSDoc, external JSDoc and paired-budget JSDoc. Both the single-entry and multi-file tests passed.

The multi-file case includes helper.cjs in the artifact manifest and entry.cjs as the sole launcher entry. The launcher verifies both artifacts but requires only entry.cjs; that entry loads the helper and passes the returned callback to a Node preload's queueMicrotask observer. The preload reads Function#toString without invoking the callback. Native and transformed application output remain done, while the observed callback source changes. This closes actual multi-file SNO CLI/default-identifier coverage.

**Scope:** this is a focused test-only branch receipt, not a production fix or comprehensive acceptance run. It does not cover SNO CLI string encoding; the separate launcher-API string variant remains run 45328512061. Full CLI/package compatibility and the 2.5x runtime budget remain open.

*Integration note added by Agent 3; the test and branch are Agent 9's work.*
