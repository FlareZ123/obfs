# Source-visible ambient reflection alias and mutation bypass (16 November 2026)

**Evidence class:** intermediate semantic counterexample, followed by a conservative compiler fix under active validation. This research extends the independently merged external-preloader and Chromium witness in [host reflection callbacks](host-reflection-callback-2026-11-16.md) and the existing direct-assignment refusal tests.

## Initial reproducible defect

In a three-file closed ESM graph, `record.mjs` holds a private literal `schema={externalFormat:'audit-v1',auditCount:3}` and exports `inspectRecord(key)`. It invokes `Reflect.ownKeys(schema)` and `Object.getOwnPropertyDescriptor(schema,'externalFormat')`, then returns `schema[key]`. A second module exports `state={secretField:41}`. The entry imports both modules, calls `inspectRecord('auditCount')` and may dynamically import its state module if the returned field is a function. A Node `--require` preloader supplies `globalThis.RUNTIME_FACTORY=Function`, withheld from the closed compiler input.

The entry's **source-visible** `const R=Reflect; R.ownKeys=function(receiver){...}` mutation replaces the ambient reflection method *before* inspecting the private record. Its callback writes `schema.auditCount=globalThis.RUNTIME_FACTORY`, forwarding to the original method. The compiler formerly scanned only syntactic writes to `Reflect.ownKeys` or `Object.getOwnPropertyDescriptor` spelled directly. It did not track a named alias to the same runtime builtin. In the initial test at [269eefa3](https://github.com/FlareZ123/obfs/commit/269eefa320b8c09fa13041f9d5447d1cfc63b776), Ubuntu and Windows CI [43842533411](https://github.com/FlareZ123/obfs/actions/runs/43842533411) showed **1** renamed private property where a behavior-preserving transform must decline (**0**). This was a protected-work correctness issue in the declared source graph, under a host that supplied an opaque legitimate callback. It is more specific than arbitrary attacker-side monkeypatching of already-delivered bytes.

## Implemented conservative guard

`src/cross-properties.js` now walks each declared module's syntactic bindings and records monotone alias edges. It recognizes direct `Reflect` and `Object` roots, aliases obtained from `globalThis`, `window`, `self` and `global`, and static property destructuring from their aliases. It refuses the special private-record proof when a declared module writes, updates, or deletes `Reflect.ownKeys` or `Object.getOwnPropertyDescriptor` through one of these aliases. A declaration that binds a previously resolved alias to another value may cause conservative refusal, because the graph proof intentionally uses reachability rather than flow-sensitive kill sets.

Additional source-visible mutation mechanisms were ablated in the same fixture:

- `Object.defineProperty(R,'ownKeys',descriptor)` where `R` is a Reflect alias;
- `Reflect.set(R,'ownKeys',callback)`;
- `Object.assign(R,{ownKeys:callback})`.

Before the API-call guard, all three still yielded **1** private owner-field rename under the tested compiler, despite the visible mutation. This was reproduced as three failed expectations on both OSes in [43843622213](https://github.com/FlareZ123/obfs/actions/runs/43843622213) at [75275d57](https://github.com/FlareZ123/obfs/commit/75275d57e0b7cec0086ffcc0bcdc4aec4f2ca268). The guard now conservatively refuses when such mutating API calls target known `Reflect` / `Object` aliases. It also guards the corresponding complete ambient bindings replaced through global-object aliases (for example, `const Root=globalThis; Root.Reflect=replacement`).

The test file `test/closed-record-reflect-alias-overwrite.test.js` contains standalone three-module ESM differential cases. It compares original and compiled output in separate fresh Node processes, asserts exact output and reported compiler property-renaming yield, and uses `atomicWrite` for all temporary sources. A clean record and unrelated local `ownKeys` overwrite must continue to yield **one** transformed private field, so purely conservative collapse to zero fails the positive tests. A benign Reflect alias with an assignment to an unrelated field also retains the positive transform.

## Validation and limitations

The first minimal alias fix was green across Ubuntu, Windows, and Node 22 legacy [43842897435](https://github.com/FlareZ123/obfs/actions/runs/43842897435). The subsequently expanded transitive, global alias and positive-control suite was green on the same jobs [43843288961](https://github.com/FlareZ123/obfs/actions/runs/43843288961).

**Do not generalize this as a complete semantics proof.** These are finite source-shape regressions. The guard does not model every conceivable reflective indirection, such as arbitrary user-defined helper functions that receive mutable builtin objects, higher-order aliases of mutator functions, proxy-side effects, or unrelated runtime-provided monkeypatches outside declared compilation inputs. The API-call rule deliberately prefers conservative refusal for some benign assignments to ambient objects whose complete side effects are not proved. The fresh-process tests use the expected opaque host callback and do not establish full browser compatibility or resistance to extraction by an authorized COO/SNO owner.

The earlier [real Chromium positive-yield witness](host-reflection-callback-2026-11-16.md) provides an independent check of the external hostile-intrinsic threat model; it is not validation of every new alias fix. Further work should track both **false negative semantic risks** and **lost positive protected-work yield** on real applications, and independently test aliases through `Object.defineProperty`, `Reflect.apply`, and loader/realm boundaries. 

## Concurrent research and merge contract

Agent 21 independently reproduced direct `Reflect` alias and nonliteral computed-global alias hazards earlier on 16 November 2026. Its existing [source-level report](closed-record-reflection-alias-2026-11-16.md) and tests in `test/cross-file-safe-record-read.test.js` establish that boundary. This Agent 23 extension adds seven further alias/positive controls and tests reflective mutator API calls and replacement of `globalThis.Reflect` using a different runtime mechanism. The integration must **retain** Agent 21's original report and both computed-global and opaque-escape guards; it refines ordinary directly tracked alias bindings to preserve useful positive renames without weakening the tested mutation refusal. Only a CI gate containing both agents' source-visible tests is sufficient for the combined claim.
