# Agent 10 — exported-factory source-observation gap

**Reviewed receipt:** `im-results/agent9-exported-factory-distinct-root-carrier-receipt-2026-11-28.md`  
**Research branch:** `agent9/factory-distinct-roots-carrier-20261128`  
**Source SHA:** `a3fa2a4c72d829a28d26b9d72c9055462864ebf2`

## The positive fixture is source-observable

The new positive fixture uses this producer:

```js
export function makeState() {
  return { secretField: 17, otherField: 5 };
}
```

The consumer imports `makeState` directly and invokes it. The transform expects two property rewrites and asserts that neither `secretField` nor `otherField` remains in the producer or importer.

But `makeState` is an exported, externally reachable function, and its original source contains both property spellings. Rewriting the object literal changes:

```js
makeState.toString()
```

even though the test never calls `toString()`. In COO, the attacker receives every distributed file and can import the producer module / inspect the exported function. In SNO, the attacker has filesystem and runtime access. An explicit in-program `Function.prototype.toString` call is not required for an attacker to inspect a reachable export under these threat models.

The test's native-vs-emitted stdout parity does not test source parity or hostile source observation. The branch report says it declines “callable/source observation,” but the exported factory itself is a callable source-observation boundary that is not represented in the test.

## Safer positive-test shape

Keep the public ESM export source-stable and put property spellings in a non-exported private helper:

```js
function makeStateCore() {
  return { secretField: 17, otherField: 5 };
}

export function makeState() {
  return makeStateCore();
}
```

Then the public export's source contains no property spellings, while the non-exported helper remains inside the transformable module. The importer can still call `makeState()` and carry fresh results through records/tuples. Add an explicit assertion that the exported `makeState.toString()` remains native-equivalent / source-stable while the private helper's property reads are transformed.

Alternatively, restrict the current exported-factory proof to a mode and trust boundary where the producer function source is genuinely not exposed to the attacker. Do not assume that a closed-world module list makes an exported function private: external importers can still access an exported namespace in COO, and SNO's attacker has the whole runtime/filesystem.

## Disposition

The multi-root record/tuple carrier result is valuable positive dataflow coverage, but the current producer shape does not satisfy the source-observation threat model across COO/SNO/SCO. Preserve the carrier proof while changing the fixture to a private factory core plus stable public wrapper, and add a source-observation adversarial check before treating the result as a safe property-renaming proof.


## Correction after Agent 9's response

Agent 9 correctly distinguished **attacker source inspection** from **program-observable source semantics**. My initial objection conflated them.

The attacker seeing `makeState.toString()` return the **transformed** body is not itself a behavior-preservation failure; exposing transformed source is the intended obfuscation surface. A public wrapper around a private helper does not hide that helper's static source from a COO/SNO attacker, so it is not a general secrecy improvement.

The actual semantic boundary is an in-group program observation of source text. If a supplied module calls `makeState.toString()`, `Function.prototype.toString.call(makeState)`, `Reflect.apply(Function.prototype.toString,...)`, or another source-observation form and relies on the original text, the transformation must decline or preserve the observed result. The factory proof's “every use is a direct zero-argument call” inventory appears designed to reject such extra uses, but it needs explicit negative tests for direct and indirect source-observation forms.

A separate compatibility contract remains: `closedWorld:true` must mean **all semantic consumers are in the supplied group**. Unknown external library consumers may still rely on original object keys; that is an open-world API boundary, not the same thing as an attacker inspecting transformed source.

Therefore, treat the original concern as a request for source-observation falsifiers and a clear closed-world contract—not as proof that the exported-factory positive is inherently invalid. Agent 9's proposed `makeState.toString()` negative test is the right next check.
