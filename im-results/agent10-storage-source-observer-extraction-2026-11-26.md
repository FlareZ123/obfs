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


## Agent 1 independent review: exported WeakMap backing-store escape (15:12Z)

The reference-only override proof has a confirmed false-safe not covered by the earlier positive controls. The helper `isStableWeakMapInstance` established a single local `new WeakMap()`, no rebinding, and no direct instance `.set` replacement, but did not establish that the backing map remained private.

A red-first fixture exports the backing instance. An importing host can replace `captured.set` with a wrapper that captures `String(value)` and delegates to the original WeakMap method. The module's Storage override stores a private function reference in the map; the host wrapper then observes the function's source after the obfuscator has renamed its local bindings.

Receipts on Agent 10 candidate head `ba9b4b1503ed4422be06314df1a03d9e38f48a07`:

- Run [45842633950](https://github.com/FlareZ123/obfs/actions/runs/45842633950): private unmodified WeakMap positive passed; exported backing-map negative failed on all three platforms because `observesFunctionSource` returned false and the compiler performed four identifier rewrites.
- Run [45843093395](https://github.com/FlareZ123/obfs/actions/runs/45843093395): runtime witness reproduced different native/emitted source. Native capture: `function inspect(){const privateLocal=29;return privateLocal;}`; emitted capture: `function inspect(){const _v966a9e5f8923=29;return _v966a9e5f8923;}`. Ordinary results remained equal (`sameReference: true`, `storageValue: null`, `value: 29`, `independent: 7`).
- Direct source-visible `WeakMap.prototype.set` string-coercion mutation was already refused by the existing observer; the initial concern about that specific mutation is retracted.

### Candidate fail-closed correction

Agent 1 created an independent review branch `agent1/storage-weakmap-falsifier-20261126` from the Agent 10 candidate. It adds a closed identifier-use proof for the backing WeakMap: only direct `.set`/`.get` receiver uses are accepted; export specifiers/declarations, aliases, returns, object/array storage, unknown-call arguments, reflective mutation, and direct instance method replacement invalidate the reference-only premise.

- Focused run [45843922309](https://github.com/FlareZ123/obfs/actions/runs/45843922309) passed on Ubuntu/Windows/macOS with strict JSDoc, including the runtime host-mutation parity witness.
- A stricter follow-up rejects any source-visible `WeakMap` identifier use outside `new WeakMap()` construction, including identity-preserving `WeakMap.prototype.set` wrappers. Focused run [45844947562](https://github.com/FlareZ123/obfs/actions/runs/45844947562) passed on all three platforms with strict JSDoc.
- The latest candidate additionally rejects direct global-object `WeakMap` property access and reflective global-object mutation. Its focused run [45846488995](https://github.com/FlareZ123/obfs/actions/runs/45846488995) is queued.
- Integrated candidate head `ba75c5d4fc20bc7122bc83262d6d62c5f539d14a` includes the backing-map escape fix and conditional Wasm refusal wording. Full Chromium run [45844452736](https://github.com/FlareZ123/obfs/actions/runs/45844452736) passed. Full Node/manual-validation run [45844107774](https://github.com/FlareZ123/obfs/actions/runs/45844107774) has Ubuntu success and Windows still in progress.
- Broader Chromium run [45845695742](https://github.com/FlareZ123/obfs/actions/runs/45845695742) on the stricter `53679a5` head is queued.

The candidate patch has **not** been cherry-picked into Agent 10's branch or integrated into PR #382. Agent 10 has received the exact reproduction, runtime witness, patch branch, and focused receipts in `communications/agent10/`; Agent 2 has been notified that the PR remains blocked. Keep PR #382 draft until the exact final head passes full Node and browser validation and the PR owner authorizes the head move. This review does not establish full release readiness or any general anti-instrumentation/source-secrecy guarantee.
