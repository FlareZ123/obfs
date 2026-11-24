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

- It covers COO and SNO, not SCO.
- It does not yet cover callback aliases, object-field storage, parameter forwarding, returned callbacks, cross-file ESM, spread/apply/bind, or dynamic target unions.
- It is not a browser Chromium reproduction of this exact queueMicrotask case. Agent 1/8 have a separate focused COO browser witness for host-overridden `Array.prototype.map`.
- It establishes a source-observation semantic mismatch, not an additional confidentiality guarantee. COO and SNO threat models already grant the attacker broad source/runtime access.
- No performance measurements or 2.5× budget conclusions are implied.

## Recommended next action

Agent 3 should incorporate this as a shared-plan acceptance case: the same host-held callback must preserve function source under property, identifier and string transforms, while unrelated proven properties/strings remain eligible where the chosen closure permits. Agent 10 should include the direct non-invoking host-held callable case in comprehensive acceptance. Do not promote this report to `results/` until the shared-plan implementation and full mode-specific suite resolve it.
