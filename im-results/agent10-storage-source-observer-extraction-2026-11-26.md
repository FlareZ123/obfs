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


## Follow-up: alias-chain coverage (14:04Z)

A second red-first expansion found four more false-safe forms on the exact PR #382 head:

1. assignment-pattern destructuring: `let setItem; ({setItem}=localStorage)`;
2. descriptor alias chain: `const descriptor=Object.getOwnPropertyDescriptor(...); const setItem=descriptor.value`;
3. aliased `Reflect.get`: `const get=Reflect.get; const setItem=get(...)`;
4. aliased `Object.getOwnPropertyDescriptor`: `const descriptorReader=Object.getOwnPropertyDescriptor; const setItem=descriptorReader(...).value`.

Red run [45834746030](https://github.com/FlareZ123/obfs/actions/runs/45834746030) reproduced all four on Ubuntu, Windows, and macOS. Descriptor-value destructuring was a passing control.

The candidate now propagates descriptor-reader and Reflect.get aliases, descriptor provenance, and assignment-pattern destructuring. Updated branch head: `4bf2b7665eeaca075450c54561834bbf609554f1`.

- Focused run [45834998110](https://github.com/FlareZ123/obfs/actions/runs/45834998110): all 10 tests passed on Ubuntu, Windows, and macOS; strict project JSDoc passed.
- Full browser run [45834011704](https://github.com/FlareZ123/obfs/actions/runs/45834011704): completed successfully for the original four extraction cases and existing Storage compatibility controls.
- Expanded browser run [45835170635](https://github.com/FlareZ123/obfs/actions/runs/45835170635): the Storage step passed all 9 browser variants and existing positive controls; the full browser workflow was still in progress at this update.
- Full Node validation [45835473467](https://github.com/FlareZ123/obfs/actions/runs/45835473467): full Node 22 behavioral/adversarial suites running on Ubuntu and Windows.

The candidate is still an intermediate review branch attached to PR #382, not an integrated release. It does not establish full mode-specific, runtime-budget, dynamic-analysis, or deobfuscation acceptance.


## Cross-file and SNO follow-up (14:28Z)

### Cross-file ESM import provenance

A red-first module fixture showed that a native Storage method exported from one ESM module and imported into another lost its Storage provenance. On pre-fix candidate commit `f65cd90c41e636f0e0c4890f5dca421673126ea1`, run [45836148589](https://github.com/FlareZ123/obfs/actions/runs/45836148589) allowed one property rename and changed the stored source.

The candidate adds `collectImportedStorageMethodAliases` to `src/cross-properties.js`, passes each module's imported method proof through `src/core.js`, and seeds the importer source observer. Explicit named reexports are propagated too.

- Run [45837148262](https://github.com/FlareZ123/obfs/actions/runs/45837148262): 13 focused tests passed on Ubuntu/Windows/macOS with strict project JSDoc, including the direct cross-file import.
- Run [45837473884](https://github.com/FlareZ123/obfs/actions/runs/45837473884): 14 focused tests passed on Ubuntu/Windows/macOS, adding named reexports and destructured `getItem`/`removeItem` conversion cases.
- Run [45837523283](https://github.com/FlareZ123/obfs/actions/runs/45837523283): full Chromium workflow passed with the cross-file ESM import scenario.
- Run [45838666175](https://github.com/FlareZ123/obfs/actions/runs/45838666175): full Chromium workflow passed again after the SNO single-file observer and bound-function changes.

### SNO single-file source observation

Full Node run [45835473467](https://github.com/FlareZ123/obfs/actions/runs/45835473467) on earlier candidate head `4bf2b766` exposed four SNO parity tests that documented a source leak. Root cause: `src/core.js` only applied `observesFunctionSource` to `remoteSourceObserver` when `prepared.length>1`, leaving single-file SNO unprotected.

The candidate removes that gate so local and cross-file function-source observations both block unsafe rewriting. It also narrowly recognizes direct, unmodified bound functions as safe for Storage conversion: native bound-function stringification yields a fixed native-code placeholder rather than the target's source. Bound aliases with mutation are not exempted.

The SNO parity tests now require source preservation for direct `localStorage`, `sessionStorage`, and a CommonJS cross-file factory-return case, while retaining the bound-function and primitive-value positive controls.

- Focused SNO run [45838407376](https://github.com/FlareZ123/obfs/actions/runs/45838407376): passed on Ubuntu, Windows, and macOS.
- Full Node 22 validation [45838633117](https://github.com/FlareZ123/obfs/actions/runs/45838633117): still running on Ubuntu/Windows at the time of this update; it includes the full behavioral/adversarial suite, 14 Storage tests, and updated SNO parity expectations.

**Current candidate head:** `b6c33f142a1d45d2c7834b4db09071e20c6f4d9b`.

### Remaining boundaries

The imported-method collector currently covers named ESM imports, default imports, explicit named reexports, and `export *` propagation. Namespace imports, opaque/indirect reexports, CommonJS method imports, and method aliases returned from arbitrary factories are not established by this work. The CommonJS SNO factory-return test is protected conservatively because the entry file's direct Storage source observation disables rewriting across the supplied file group; it is not a general interprocedural return-provenance solution.

This remains an intermediate source-observer correctness contribution, not proof of complete SCO/COO/SNO acceptance, dynamic-analysis resistance, 2.5× runtime compliance across workloads, or release readiness. Overall posture remains RELEASE-BLOCKED.
