# Storage value-conversion hooks: native dispatch and source-observer precision

**Status:** Intermediate research result. Test-only changes; no production compiler patch.  
**Extended test-only validation pin:** [`d705dbb95382e26089d272b6080dfcd1ec79b2b1`](https://github.com/FlareZ123/obfs/commit/d705dbb95382e26089d272b6080dfcd1ec79b2b1)  
**Compiler blobs:** `src/ast.js` = `c227e6e604635a42663af745fd0cfb194b215a67`; `src/identifiers.js` = `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`.

**Mainline relationship checked 2026-11-23T17:20Z:** the test pin `d705dbb` is an ancestor of `main` at `1c073787256c84a1185c5e43695004195bd5a307`, 28 commits behind. The intervening comparison contains no changes under `src/`, `test/`, `package.json`, `package-lock.json`, or `.github/workflows/`. The three witness test blobs are identical on `main` and the pinned branch: `storage-value-coercion-controls.test.js` (`fe89e132…`), `storage-value-coercion-fixtures.js` (`9a3c8872…`), and `storage-value-coercion-controls-browser.js` (`26dce6e5…`). Thus the test-only witness is now present on main with the same compiler/test bytes. This provenance check does not upgrade focused receipts into a full Node/browser acceptance result.

## Question and scope

The Storage interface defines `setItem(DOMString key, DOMString value)` in the [WHATWG HTML Standard, Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html). Either argument can therefore invoke JavaScript string conversion. This investigation isolates native Storage dispatch, own conversion hooks, direct Function#toString, patched Function#toString, and JavaScript prototype overrides, while checking whether unrelated private rewrite yield survives.

## Reproduction artifacts

- `test/storage-value-coercion-fixtures.js`: shared exact source fixtures.
- `test/storage-value-coercion-controls.test.js`: source-observer and binding-yield characterization.
- `test/storage-value-coercion-controls-browser.js`: native-versus-emitted Chromium witness.
- `.github/workflows/manual-browser.yml`: one manual-only Chromium step for the witness. No per-commit workflow was added.

## Evidence

### Focused Node and JSDoc

[Manual focused run 45196328867](https://github.com/FlareZ123/obfs/actions/runs/45196328867) passed on the exact pin on both Ubuntu and Windows. Strict project and external JSDoc passed on both. The full Node 22 job was skipped; this is not a full-suite acceptance receipt.

The passing assertions establish:

| Fixture | `observesFunctionSource` | Binding rewrite | Interpretation |
|---|---:|---:|---|
| Own `toString` returns a stable primitive; non-throwing `this === inspect` receiver check | false | At least 2 | Safe positive-yield control; `privateLocal` and `independentLocal` are rewritten |
| Own `Symbol.toPrimitive` returns a stable primitive | true | 0 | Conservative over-refusal; computed symbol-key write is treated as unknown |
| Direct `Function.prototype.toString.call(inspect)` despite own `toString` | true | 0 | Correct source-observation negative |
| JavaScript `Storage.prototype.setItem` override captures the function in a `WeakMap` | false | At least 2 | Positive-yield wrapper path; exact object identity retained |
| Patched `Function.prototype.toString` delegates to captured native method | true | 0 | Correct source-observation negative |

An earlier intentionally-red classification matrix, [run 45193389961](https://github.com/FlareZ123/obfs/actions/runs/45193389961), isolated a receiver-sensitive variant. A plain own-`toString` assignment, the same hook with a counter, and function-valued native Storage key/value calls all classify false. The combination `if (this !== inspect) throw new Error(...)` classifies true. This is a throw-path effect, not a receiver-identity effect: `observesFunctionSource` marks a `ThrowStatement` when `failureMayReachHost(ancestors)` is true (`src/ast.js:2627-2631`), because uncaught host diagnostics can expose source coordinates. The accepted fixture's non-throwing `this === inspect` result check therefore remains eligible for private rewrites; a potentially uncaught throw remains conservatively refused.

### Real Chromium

[Manual browser run 45196524492](https://github.com/FlareZ123/obfs/actions/runs/45196524492) completed the new step **“Verify Storage own ToString and Symbol.toPrimitive conversion paths in Chromium”** successfully on Chrome 157.0.8103.78 at the exact pin.

The five-case witness asserts:

1. **Own `toString`:** native `localStorage.setItem(inspect, "value")` invokes the function's own hook, binds `this` to the function, stores the stable key, and preserves results after the emitted module rewrites private bindings.
2. **Own `Symbol.toPrimitive`:** native `sessionStorage.setItem("storage-own-symbol", inspect)` invokes the hook with hint `"string"`, binds `this` to the function, and stores the stable value. The current compiler conservatively leaves this module unchanged.
3. **Direct Function#toString:** `Function.prototype.toString.call(inspect)` bypasses the own hook; the function source is stored and the own-hook call count remains zero. The compiler refuses this module.
4. **Prototype override:** a JavaScript wrapper captures the exact function object in a `WeakMap`; `sameReference` is true, the native Storage string value remains `null`, and the compiler retains unrelated private rewrite yield.
5. **Patched Function#toString:** a patched wrapper delegates to the captured native method; native Storage conversion calls it once and stores the original function source. The compiler refuses this module.

The harness compares native and emitted result objects in all five cases.

The overall manual-browser workflow is **red**, not green. After the new Storage step passed, the existing `test/bound-runtime-interception-browser.js:52` assertion failed with `0 !== 2`. The run also logged the existing DOM source/stack parity mismatches. These are separate from the completed Storage step and prevent any full-workflow acceptance claim.

### Harness failure accounting

The first extended attempt at `ae844bf` was invalidated by two test-harness defects: the fixture helper lacked `module.exports={fixtures}`, and the browser script contained unquoted lines inside the HTML source array. Runs [45195813252](https://github.com/FlareZ123/obfs/actions/runs/45195813252) and [45195822563](https://github.com/FlareZ123/obfs/actions/runs/45195822563) are harness failures, not evidence about compiler semantics. Both defects were fixed before the validated `d705dbb` pin.

### Related native dispatch evidence

Agent 12's earlier same-file source-parity witness is the direct emitted-source mismatch: [manual Web IDL run 45162975795](https://github.com/FlareZ123/obfs/actions/runs/45162975795), source head `0f35ae3ea8dfdaf39e5bba9005e45f25ed27021e`, documented in `im-results/storage-source-observation-2026-11-23.md`. The focused Node controls passed 5/5 on Ubuntu and Windows; the Chromium Storage step reported `sourceMismatch=true`, `metrics.bindings=4`, and native `inspect(){...privateLocal...}` versus emitted `inspect(){..._v...}`. The browser fixture covered localStorage.setItem value conversion, sessionStorage.setItem value conversion, the Storage named-property setter, and a function-valued explicit method key; the independent helper retained a private rename and returned 7. The full workflow later failed in unrelated Blob positive-yield assertions, not the Storage step. This is the primary source-parity witness; keep it distinct from the later four-path override/captured-alias matrix.

Agent 12's separate four-path witness remains distinct and complementary: inherited native `localStorage.setItem` and a captured native alias expose function source; own-instance and prototype JavaScript wrappers retain the function object. Its focused Node/JSDoc run is [45181276801](https://github.com/FlareZ123/obfs/actions/runs/45181276801), and its Chromium Storage step is in [45181268302](https://github.com/FlareZ123/obfs/actions/runs/45181268302). The new mainline prototype fixture now adds the exact `WeakMap` identity assertion Agent 3 requested.

### Named-property setter is a separate native dispatch route

The Storage IDL declares `setter undefined setItem(DOMString key, DOMString value)`. Web IDL's legacy-platform-object `[[Set]]` algorithm invokes the named-property setter, and the named-property-setter algorithm converts the assigned value to the declared IDL type before performing the operation's method steps. This is not a JavaScript property lookup of `storage.setItem` (see [HTML Storage IDL](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface) and [Web IDL §§2.5.6.2, 3.9.2, 3.9.7](https://webidl.spec.whatwg.org/)).

A test-only probe at branch commit `df2b1e1b5b1a1889ff91d912b4c1ce8264629394`, [manual browser run 45229225022](https://github.com/FlareZ123/obfs/actions/runs/45229225022), completed the Storage step on Chrome 157.0.8103.78 with:

```json
{"baselineMethod":true,"baselineNamed":true,"prototypeMethodOverride":true,"prototypeNamedBypassesMethod":true,"ownMethodOverride":true,"ownNamedBypassesMethod":true,"prototypeCalls":1,"ownCalls":1}
```

The native method and named setter both stored the function's native source. Replacing `Storage.prototype.setItem` intercepted the explicit method call but not `storage[key] = inspect`; defining an own `localStorage.setItem` override had the same result. Each JavaScript wrapper was called exactly once, while each named-property assignment still stored native source. This confirms that the named-property setter is a distinct native Web IDL dispatch route, unaffected by these JavaScript method-property overrides.

The containing full browser workflow was **red**, not green: it later failed at the existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`). The named-setter probe itself passed. No compiler source changed.

### COO/SCO and SCO host-lock controls

The same Storage source-observer miss was checked across client modes in test-only branch `agent47/storage-named-setter-dispatch-20261123`:

- [Focused validation run 45231065988](https://github.com/FlareZ123/obfs/actions/runs/45231065988), test commit `22d6d87e607fdc12fb4cd040d88fc317c2c0fb51`: the COO and SCO client-transform tests passed on Ubuntu and Windows. In both modes, `observesFunctionSource` returned false and identifier rewriting changed both the source-observed function's private binding and an unrelated helper.
- [Focused validation run 45231595687](https://github.com/FlareZ123/obfs/actions/runs/45231595687), test commit `bf2bf7f3369d2c26fc5ff8aa1db909a51b8516d9`: the same two mode tests plus an SCO host-lock test passed on Ubuntu and Windows. With `mode:'sco'` and `allowedHosts:['example.com']`, the output contained the allowed hostname/host-lock wrapper and still renamed both private bindings while `observesFunctionSource` returned false.

The host-lock result follows from `src/core.js:2021`: `hostLockSourceObserver` reuses the same source-observer predicate, so the missed Storage sink does not cause host locking to be rejected. The wrapper is inserted after the local identifier rewrite.

- **Direct SCO browser source-parity:** [manual browser run 45233032518](https://github.com/FlareZ123/obfs/actions/runs/45233032518), source commit `fcfb7c437b536805b8fa296f6d479c083ad78226`, Chrome 157.0.8103.78. With `mode:'sco'` and `allowedHosts:['127.0.0.1']`, the host-locked module executed on the allowed origin. It reported `sourceMismatch=true`; native source contained `privateLocal`, compiled source contained `_v83c23ee54f48`; both returned value 29 and the independent helper returned 7. Thus the host lock does not repair the Storage source-preservation gap. The Storage step passed, but the full workflow later failed at the existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`).

The first SCO browser attempt used a parameter-derived Storage key and was conservatively rejected by host locking. [Focused diagnostic run 45232774349](https://github.com/FlareZ123/obfs/actions/runs/45232774349) isolated this: literal-key variants returned `observesFunctionSource=false`, while the parameter-derived-key variant returned true. The final SCO browser witness uses a literal key to isolate the missed function-valued second-argument conversion. These are passing expected-red controls, not acceptance receipts; the full Node 22 job was skipped in focused workflows. No SNO conclusion is made.

## Interpretation

- **Native Storage source observation remains a missed analyzer case.** Agent 12's ordinary-function native/captured-native witness shows native Web IDL conversion can expose changed function source while numeric behavior remains unchanged. The current source observer does not model Storage receiver/callable identity, and reduced plain `setItem` key/value forms classify `observesFunctionSource=false`. Do not infer those plain calls are safe from the current predicate.
- **Own `toString` can be a safe positive-yield path.** A stable primitive hook intercepts native DOMString conversion; unrelated private bindings can still be renamed.
- **Own `Symbol.toPrimitive` is currently over-refused.** The computed symbol-key write is classified as an unknown source-observing operation even when the hook returns a fixed primitive. This is a precision/yield loss, not evidence of source exposure.
- **Direct Function#toString remains a true source observer.** It bypasses own conversion hooks and must preserve observed function source.
- **A JavaScript prototype override is not native dispatch.** The wrapper receives and retains the exact callable object; this path can preserve private rewrite yield.
- **A patched Function#toString that delegates to the native method is source-observing.** The browser confirms native Storage conversion reaches the patched method and returns the original source.
- The potentially uncaught throw inside the receiver-check variant is a separate source-coordinate refusal; do not conflate it with native Storage dispatch or weaken the source-preservation negative to admit it.

## Limitations and next work

This evidence is one Chromium environment and five bounded cases. It does not establish behavior across all engines, realms, proxies, pre-module host patches, or arbitrary conversion-hook bodies. It does not implement the required BindingId / receiver / effective callable / ToPrimitive capability graph, source-span protection, or closure-preserving rewrite plan.

Next work should keep separate controls for native inherited method calls, captured native aliases, the internal named-property setter (`storage[key] = value`), own/prototype method overrides, both DOMString argument positions, own `toString`, own `Symbol.toPrimitive`, bound functions, patched `Function.prototype.toString`, and direct Function#toString. Any eventual compiler admission must preserve the callable's exact source and source-reachable closure while retaining unrelated private yield. A method-name-only `.setItem` veto is not an acceptable solution.

**No release status changed.** This is an intermediate result, not a production security claim or comprehensive acceptance result.
