# Web Storage source-observer extraction coverage

**Research state:** intermediate reproducible implementation and regression evidence  
**Date:** 26 November 2026  
**Owner:** Agent 10  
**Integration context:** Agent 2's draft PR #382, stacked on Agent 1's exported-closure branch  
**Candidate branch:** `agent10/storage-source-observer-destructure-reflect-20261126`  
**Candidate head:** `d1e61fdc54decb25cf49ed237749c834176f8cde`  
**Base PR head:** `1bab0360e356c6174339111919ce07c124aa0491`

## Finding

The Storage source-observer implementation at the exact PR #382 head did not recognize four ways of extracting the native `Storage.setItem` method:

1. `const {setItem}=localStorage`
2. `const {setItem}=Storage.prototype`
3. `Object.getOwnPropertyDescriptor(Storage.prototype,'setItem').value`
4. `Reflect.get(Storage.prototype,'setItem')`

Each form could be invoked with `.call(localStorage,'k',new.target)`. Web IDL DOMString conversion stringifies the constructor function, exposing the original `outer` source. The source observer nevertheless allowed a property rename inside that source.

The adversarial test constructs the module's exported `outer` function outside the source graph and calls `new outer()`. The Storage shim records `String(value)`, matching the Web Storage DOMString conversion relevant to this source-observation path.

## Reproduction and evidence

| Evidence | Exact result |
|---|---|
| Red-first focused run [45830580214](https://github.com/FlareZ123/obfs/actions/runs/45830580214) | All four negative cases failed on Ubuntu, Windows, macOS; each emitted one property rename and changed the stored function source |
| Matched primitive-only control in 45830580214 | Passed on all three OSes; one property rename retained |
| Candidate focused run [45833983836](https://github.com/FlareZ123/obfs/actions/runs/45833983836) | All five candidate tests passed on Ubuntu, Windows, macOS; strict project JSDoc checks passed |
| Real Chromium run [45834011704](https://github.com/FlareZ123/obfs/actions/runs/45834011704) | The Storage browser step passed, including existing custom-coercion/prototype-override controls and the four new extraction cases; the full manual-browser workflow had not yet completed when this report was written |

The test sources are:

- `test/agent10-storage-source-observer-adversarial.test.js`
- Expanded `test/storage-value-coercion-controls-browser.js`

## Candidate implementation

The candidate adds bounded Storage-method recognition for:

- direct Storage collection and `Storage.prototype` references;
- variable destructuring from those owners;
- direct descriptor `.value` extraction;
- direct `Reflect.get` extraction;
- existing `.call`, `.apply`, `.bind`, and `Reflect.apply` paths.

The first browser run also exposed two compatibility regressions in the original PR patch:

- A function with a preceding own `toString` or `Symbol.toPrimitive` hook that is narrowly proved to return a primitive was incorrectly treated as native function-source conversion.
- A `Storage.prototype.setItem` override that only stores the receiver/value pair in a stable native WeakMap was incorrectly treated as the native Web IDL method.

The candidate uses deliberately narrow proofs for these cases. Unknown custom hooks and overrides remain fail-closed. The existing Chromium control suite passes its Storage step on the candidate head.

## Limits and unresolved work

This evidence does **not** establish complete Storage coverage. In particular, the current candidate does not claim support for every assignment-pattern destructuring form, arbitrary descriptor alias chains, aliased `Reflect.get`/descriptor readers, or all reflective/proxy paths.

The new focused tests exercise COO through `obfuscateFiles`. The real Chromium test validates browser Storage behavior for the tested cases. This is not a complete SCO/COO/SNO acceptance run, does not validate the 2.5× compute budget, and does not establish resistance to dynamic analysis or source reconstruction.

The candidate is intentionally kept as a review branch attached to PR #382 rather than opened as a competing production PR. Agent 2 and Agent 1 have been sent the exact branch, test receipts, and remaining boundaries. Agent 3 has been asked for an adversarial cross-review.

## Reproduction

Run the focused suite through the existing manual validation workflow with:

```text
focused_test=test/agent10-storage-source-observer-adversarial.test.js
```

Run the real-browser Storage controls through the existing `manual-browser.yml` workflow. Do not interpret a focused pass as a full release gate.

**Disposition:** useful intermediate implementation and verified focused source-observer repair; awaiting integration review and completion of the full browser workflow. Overall repository release posture remains **RELEASE-BLOCKED**.
