# Storage value-conversion hooks: native dispatch and source-observer precision

**Status:** Intermediate research result. Test-only change; no production compiler patch.  
**Exact current-main validation pin:** [`f4dd53d4d09f44257c12dcdc33dd102e6ad31517`](https://github.com/FlareZ123/obfs/commit/f4dd53d4d09f44257c12dcdc33dd102e6ad31517)  
**Compiler blobs:** `src/ast.js` = `c227e6e604635a42663af745fd0cfb194b215a67`; `src/identifiers.js` = `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`.

## Question and scope

The Storage interface defines `setItem(DOMString key, DOMString value)` in the [WHATWG HTML Standard, Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html). Therefore either argument can invoke JavaScript string conversion. The question here is narrower than general Web IDL coverage: how native Storage dispatch interacts with a function object's own `toString` / `Symbol.toPrimitive` hooks, and whether the current source observer preserves unrelated rewrite yield.

The fixtures use a function as the **key** for the own-`toString` case on `localStorage), a function as the **value** for the own-`Symbol.toPrimitive` case on `sessionStorage), and a direct `Function.prototype.toString.call` bypass control.

## Reproduction artifacts

- `test/storage-value-coercion-fixtures.js`: shared exact source fixtures.
- `test/storage-value-coercion-controls.test.js`: source-observer and binding-yield characterization.
- `test/storage-value-coercion-controls-browser.js`: native-versus-emitted Chromium witness.
- `.github/workflows/manual-browser.yml`: adds one manual-only Chromium step for the witness. No per-commit workflow was added.

## Evidence

### Focused Node and JSDoc

[Manual focused run 45194442239](https://github.com/FlareZ123/obfs/actions/runs/45194442239) passed on the exact pin on both Ubuntu and Windows. Strict project and external JSDoc passed on both. The full Node 22 job was skipped; this is not a full-suite acceptance receipt.

The passing assertions establish:

| Fixture | `observesFunctionSource` | Binding rewrite | Interpretation |
|---|---:|---:|---|
| Own `toString` returns a stable primitive; non-throwing `this === inspect` receiver check | false | At least 2 | Safe positive-yield control; `privateLocal` and `independentLocal` are both rewritten |
| Own `Symbol.toPrimitive` returns a stable primitive | true | 0 | Conservative over-refusal; the computed symbol-key write is treated as unknown |
| Direct `Function.prototype.toString.call(inspect)` despite an own `toString` hook | true | 0 | Correct source-observation negative |

An earlier intentionally-red classification matrix, [run 45193389961](https://github.com/FlareZ123/obfs/actions/runs/45193389961), isolated a receiver-sensitive variant. A plain own-`toString` assignment, the same hook with a counter, and function-valued native Storage key/value calls all classify false. The combination `if (this !== inspect) throw new Error(...)` classifies true. The new positive fixture uses a non-throwing `this === inspect` receiver check and is accepted, while the original `this !== inspect` plus `throw new Error(...)` combination is refused. This does not isolate whether the operator difference, throw statement, or Error-stack path is responsible; do not infer a more specific cause from this matrix.

### Real Chromium

[Manual browser run 45194452180](https://github.com/FlareZ123/obfs/actions/runs/45194452180) completed the new step **“Verify Storage own ToString and Symbol.toPrimitive conversion paths in Chromium”** successfully at the exact pin.

The step asserts that both Storage objects use the inherited native `Storage.prototype.setItem` callable in the fresh browser realm, and verifies:

1. Native `localStorage.setItem(inspect, "value")` invokes the function's own `toString` hook, binds `this) to the function, stores the stable key, and preserves both numeric results after the emitted module's private bindings are rewritten.
2. Native `sessionStorage.setItem("storage-own-symbol", inspect)` invokes own `Symbol.toPrimitive`, passes the hint `"string"`, binds `this) to the function, and stores the stable value. The current compiler conservatively leaves this module unchanged.
3. `Function.prototype.toString.call(inspect)` bypasses the own `toString` hook; the source is stored and the hook call count remains zero. The current compiler refuses this module.

Native and emitted result objects match in all three cases.

The overall manual-browser workflow is **red**, not green. It later fails in the separate existing `test/bound-runtime-interception-browser.js:52` assertion (`0 !== 2`). Subsequent DOM source-parity diagnostics also report their pre-existing source/stack mismatches. These failures are not in the new Storage step and do not invalidate its completed assertions, but they prevent any full-workflow acceptance claim.

### Related native dispatch evidence

Agent 12's separate four-path witness remains distinct and complementary: inherited native `localStorage.setItem` and a captured native alias expose function source; own-instance and prototype JavaScript wrappers retain the function object. Its focused Node/JSDoc run is [45181276801](https://github.com/FlareZ123/obfs/actions/runs/45181276801), and its Chromium Storage step is in [45181268302](https://github.com/FlareZ123/obfs/actions/runs/45181268302). The four-path witness's prototype override should still add an explicit `WeakMap` value identity assertion.

## Interpretation

- **Native Storage source observation remains a missed analyzer case.** Agent 12's ordinary-function native/captured-native witness shows that the browser's native Web IDL conversion can expose changed function source while numeric behavior remains unchanged. The current main source observer does not model Storage receiver/callable identity, and the reduced plain `setItem` key/value forms classify `observesFunctionSource=false`. Do not infer that those plain calls are safe merely from the current predicate.
- **Own `toString` can be a safe positive-yield path.** When the hook returns a stable primitive, the native DOMString conversion does not need the function's source, and the compiler can still rewrite unrelated private bindings.
- **Own `Symbol.toPrimitive` is currently over-refused.** The computed symbol-key write is classified as an unknown source-observing operation even when the hook returns a fixed primitive. This is a precision/yield loss, not evidence of source exposure.
- **Direct Function#toString remains a true source observer.** It bypasses own conversion hooks and must preserve the observed function's source.
- The receiver-check plus `throw new Error` variant is a separate conservative refusal; do not conflate it with native Storage dispatch or weaken the source-preservation negative to admit it.

## Limitations and next work

This evidence is one Chromium browser environment and three bounded function-value conversion shapes. It does not establish behavior across all engines, realms, proxies, pre-module host patches, or arbitrary conversion-hook bodies. It does not implement the required BindingId / receiver / effective callable / ToPrimitive capability graph, source-span protection, or closure-preserving rewrite plan.

Next work should keep separate controls for native inherited dispatch, captured native aliases, own/prototype overrides, both DOMString argument positions, own `toString`, own `Symbol.toPrimitive`, bound functions, patched `Function.prototype.toString`, and direct Function#toString. Any eventual compiler admission must preserve the callable's exact source and source-reachable closure while retaining unrelated private yield. A method-name-only `.setItem` veto is not an acceptable solution.

**No release status changed.** This is an intermediate falsifier/positive-control result, not a production security claim or comprehensive acceptance result.
