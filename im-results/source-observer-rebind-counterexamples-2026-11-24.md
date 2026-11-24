# Source-observer rebind counterexamples (24 November 2026)

**Classification:** intermediate candidate-review evidence, not an established security result.  
**Candidate snapshot inspected:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.  
**Reviewer:** Agent 4.

## Scope and execution status

The six runtime-effect fixtures originally documented below were executed under **Node v22.16.0**. Agent 50 additionally executed the exact exported-mirror overwrite fixture described in section 6 under Node v22.16.0 with TypeScript 5.8.3. These observations demonstrate the behavioral consequences of changing source outside the two original tracked spans.

I executed the pinned direct-validator harness against the exact candidate source commit using focused GitHub Actions run [45392122556](https://github.com/FlareZ123/obfs/actions/runs/45392122556). The candidate source was `246af59679d4388703b93fb36918d9e9b344cca1`; the execution branch `agent4/rebind-harness-execution-20261124` was created from that exact commit and added only the pinned harness plus a seven-line `node:test` wrapper. The execution branch head was `0ae249aa4ac8fea216a4c073bfb30f0fd0dde827`; its compare against the candidate branch was exactly two files added, zero files changed, and zero commits behind. The harness blob was `01ab16a62a1e7bd586126c0637633e24fad9df64`; the wrapper blob was `d0c4b37d0a7f8484574fd32ba370cf1f43f64ffd`.

The direct harness test passed **1/1 on Ubuntu and 1/1 on Windows**, with exit status 0 on both, under Node **v22.23.4**. It deliberately bypasses `acceptPlannedPass` and exercises `advancePlanRanges` + `validatePlanSemantics` directly; it is an isolated rebind result, not an end-to-end `obfuscateFiles` or transaction-acceptance result. The overall focused workflow concluded **failure** because the subsequent strict project JSDoc step failed on both platforms. The comprehensive `node22` job was skipped because this was a focused workflow. Agent 2's independent Acorn/Node v22.16.0 confirmation of the mutable-binding runtime remains separate evidence.

- Harness: [`source-observer-rebind-counterexamples-2026-11-24.js`](./source-observer-rebind-counterexamples-2026-11-24.js)
- Harness blob SHA: `01ab16a62a1e7bd586126c0637633e24fad9df64`
- Harness commit: `e0a3c5e8bba4b03715afd8ec402ca5d9f9e96348`

To reproduce the direct validator run, check out the candidate commit and use the exact pinned harness from the execution branch:

```sh
git checkout 246af59679d4388703b93fb36918d9e9b344cca1
git show agent4/rebind-harness-execution-20261124:im-results/source-observer-rebind-counterexamples-2026-11-24.js > /tmp/source-observer-rebind-counterexamples.js
node /tmp/source-observer-rebind-counterexamples.js
```

The script's mutable-binding insertion uses a single `\\n` escape in the source file (verified after Agent 2 flagged an initial double-escape); when executed, that becomes an actual newline. The following output was observed on both Ubuntu and Windows against the pinned candidate source:

```text
export-prefix: {"trackedRanges":2,"validatorAccepted":true}
class-Function-shadow: {"trackedRanges":2,"validatorAccepted":true}
import-Function-shadow: {"trackedRanges":2,"validatorAccepted":true}
appended-second-reader: {"trackedRanges":2,"validatorAccepted":true}
intrinsic-toString-mutation: {"trackedRanges":2,"validatorAccepted":true}
producer-disconnected-export: {"planAccepted":true,"linkedResultValueRef":null,"disconnectedResultValueRef":null,"linkedValueFlowEdgeCount":0,"disconnectedValueFlowEdgeCount":0}
exported-mirror-overwrite: {"trackedRanges":2,"validatorAccepted":true}
mutable-reader-binding: {"trackedRanges":2,"validatorAccepted":true}
```

`node --test` reported one test passed, zero failed on each platform. Thus **all seven post-plan mutations were actually accepted** by the candidate's direct validator. The producer-level comparison also actually accepted the disconnected export and showed both linked and disconnected plans had `resultValueRef:null` and zero value-flow edges.

The strict project JSDoc step then failed on both platforms with the same type errors:

```text
src/core.js(2147,42): MappedSourceRange[] is not assignable to Map<string, MappedSourceRange>
src/core.js(2149,7): Map<string, MappedSourceRange> is not assignable to MappedSourceRange[]
src/core.js(2150,7): Object[] is not assignable to MappedSourceRange[]
src/source-observation-plan.js(870,76): Map<string, MappedSourceRange> is not assignable to MappedSourceRange[]
src/source-observation-plan.js(872,3): trackedRanges MappedSourceRange[] is not assignable to Map<string, MappedSourceRange>
```

This confirms the transaction helper's array/Map contract mismatch at typecheck time. It does not establish that `acceptPlannedPass`, pass rollback, or multi-pass `obfuscateFiles` integration works; those remain unexecuted in this review.

## Shared producer fixture

```js
// UTF-16 coordinate prefix 😀
const privateRecord = { privateField: 7 };
function observed() { return 29; }
const observedSource = Function.prototype.toString.call(observed);
const label = 'safe-literal';
export const result = privateRecord.privateField;
export const sourceText = observedSource;
export const labelText = label;
```

The producer accepts this as a finite direct-reader plan. It records two source spans: the callable declaration and the direct reader call.

## Six post-plan edits

### 1. Export the formerly private callable

Insert `export ` at the start offset of the original `FunctionDeclaration`, with `affinity: 'before-node'`:

```js
export function observed() { return 29; }
```

The callable source slice itself is unchanged and maps after the prefix. Acorn's FunctionDeclaration node begins after the `export ` wrapper, and the current `callableTopLevel` predicate explicitly permits an `ExportNamedDeclaration` ancestor. The module now exposes an additional `observed` export.

### 2. Shadow the global `Function` binding

Insert before the original source:

```js
class Function {}
```

The current `inspectDeclarations` records FunctionDeclaration and VariableDeclarator bindings but not ClassDeclaration bindings. The reader call remains textually `Function.prototype.toString.call(observed)`, but now resolves to the class binding. In Node, `Function.prototype.toString` on this class's prototype resolves to `Object.prototype.toString`, producing `[object Function]`.

A second version uses a default import named `Function` from a module whose default export has a `prototype.toString()` method returning `'fake-host-source'`. Import specifiers are also absent from the current declaration count.

### 3. Add a second, unplanned source reader

Append:

```js
function secret() { return 99; }
export const leaked = Function.prototype.toString.call(secret);
```

The original callable and reader spans are unchanged. The plan still has only the original two spans and one source-mirror edge, while the transformed module now has a second direct source-reader call and exports the source of `secret`. The current rebind checks the original callable/reader matches at their mapped offsets and uniqueness of the original callable name; it does not check total source-reader cardinality.

### 4. Mutate the host intrinsic before the original reader

Insert before the original source:

```js
Function.prototype.toString = function () { return 'tampered'; };
```

The original callable and reader slices are unchanged and still syntactically direct, but the declared `pristineIntrinsicsPremise` is false before the reader executes. The current rebind does not inspect writes to the host intrinsic or prove that the `Function`/method binding still resolves to the pristine global operation.

## Observed Node v22.16.0 runtime output

The six behavioral fixtures were executed in separate data-URL module imports. Exact output:

```text
export-prefix: {"keys":["labelText","observed","result","sourceText"],"sourceText":"function observed() { return 29; }"}
class-Function-shadow: {"sourceText":"[object Function]"}
imported-Function-shadow: {"sourceText":"fake-host-source"}
appended-reader: {"sourceText":"function observed() { return 29; }","leaked":"function secret() { return 99; }"}
mutable-reader-binding: {"sourceText":"fake"}
intrinsic-mutation: {"sourceText":"tampered"}
```

These are runtime behavior observations, not proof that any currently enabled property/identifier/string pass emits one of these edits.

### 5. Change the reader-result binding to mutable and overwrite it before export

Replace `const observedSource` with `let observedSource`, then insert this statement before the existing `export const sourceText = observedSource;`:

```js
observedSource = 'fake';
```

The original reader call and callable source slices remain exact. The reader still appears as the initializer of a VariableDeclarator, and the current `readerTopLevel` predicate checks the parent/ancestor node types but not `VariableDeclaration.kind`. `inspectDeclarations` counts the declaration name but does not record const-versus-let or subsequent writes. The original producer grammar requires `const` and rejects assignments, but post-pass validation does not rerun those restrictions or validate the reader-result binding's reaching definition. The plan graph itself also omits this result path: `sourceDeliveryEdges` and `valueFlowEdges` are empty, `valueFacts` contains only the callable value, and the `sourceMirrorReadEdge.observedValueRef` points to that callable rather than to the string result binding. Consequently there is no represented edge from the reader call's returned source string through `observedSource` to the exported `sourceText`.

Node v22.16.0 runtime output is `sourceText === 'fake'`, even though the original Function#toString call still executes.

### 6. Disconnect the exported mirror without changing the reader result

Replace only the exported initializer:

```js
export const sourceText = 'fake';
```

This is deliberately separate from the mutable-binding case. The `observedSource` declaration remains `const`, no overwrite is introduced, and the original `Function.prototype.toString.call(observed)` reader still executes. Only the export's initializer changes from the reader-result binding to an unrelated primitive literal. The callable and reader spans remain exactly `[74,108)` and `[132,174)`; the exported value changes to `fake`.

Agent 50 executed this exact eight-line fixture under Node v22.16.0 with TypeScript 5.8.3 and confirmed the AST spans. I independently reran the native and changed modules in Node v22.16.0: both returned `result=7` and `labelText="safe-literal"`, while `sourceText` changed from `function observed() { return 29; }` to `fake`. My independent check also verified the unchanged source slices at `[74,108)` and `[132,174)`; it used literal UTF-16 string ranges, not an independent AST parser. This is an observed runtime/span witness; that separate runtime reproduction did not itself execute the candidate validator. The later focused harness run `45392122556` separately executed the candidate validator for this edit and observed it accept the overwrite.

The accompanying harness now has two separate checks:

- `producer-disconnected-export` calls `buildDirectFunctionSourcePlan` on the disconnected source. The executed harness observed that the producer returns a plan. It compares the linked and disconnected plans: both have `resultValueRef:null` and zero `valueFlowEdges`. The producer classifies the literal export as `primitive` but does not represent whether the reader result reaches it. This is a **producer-level linkage/scope test**, not an automatic requirement to reject every module containing an unrelated primitive export: if this first slice promises `sourceText` as the exported mirror, refuse the disconnected case; if a narrower source-read-only plan is intended, it must explicitly avoid claiming that `sourceText` is the mirror while still representing the host operation's result value.
- `exported-mirror-overwrite` replaces only the export declaration in an already planned source; the executed harness observed that `validatePlanSemantics` accepts it because both tracked spans remain unchanged. If the plan claims that this export carries the source-read result, the corrected rebind must reject the mutation by validating the export ValueFlowEdge; if the plan is intentionally narrower, it must not claim that exported mirror. This is a **post-plan rebind** obligation, distinct from the mutable-binding/reaching-write case.

The required result-flow representation is:

1. `SourceMirrorReadEdge.observedValueRef` continues to identify the callable input.
2. `HostEffectRecord.resultValueRef` identifies the distinct string value returned by the source-reading host effect.
3. A `ValueFlowEdge(kind='assignment')` connects that result value to the `observedSource` binding/value.
4. A `ValueFlowEdge(kind='export')` connects the `observedSource` value to exported `sourceText`.
5. The reader-result declaration and export declaration spans/definitions participate in semantic closure and rebind validation.

At the reviewed candidate snapshot, this is missing graph material, not merely a missing final predicate: `sourceSpans` contains only the callable and reader-call spans; `bindings`, `definitions`, `values` and `valueFacts` each contain only the callable; `HostEffectRecord.resultValueRef` is `null`; `valueFlowEdges` is empty; `effectClosures` protects only the callable span; and `semanticClosures` contains only the callable self-closure. The reader-result declaration and exported binding therefore have no represented identity for the rebind validator to preserve. Adding only an edge without the corresponding binding/definition/value/span nodes would still leave the graph incomplete.

Keep the `ExactSource` effect closure callable-span scoped: the reader/result/export path is separate semantic/value-flow structure, not a reason to mark every related span as ExactSource. The reader and binding/export declarations should receive their own source-span, binding/definition and ValueRef identities and be validated through their corresponding graph edges.

Do **not** encode an ordinary ESM export with `SourceDeliveryEdge`; that edge is reserved for SCO server-to-client publication. For this COO fixture, `sourceDeliveryEdges` should remain empty.

The two new harness outcomes are now **observed** in focused workflow `45392122556` against the exact candidate source SHA. The harness called the candidate's exported producer and validator directly; it did not substitute copied predicates or a local mirror.

## Candidate code path under review

At the reviewed branch SHA:
- `src/source-observation-plan.js:147–153`: `isDirectFunctionSourceCall` checks AST spelling, not the lexical binding of `Function`.
- `src/source-observation-plan.js` producer path: `buildBindingKinds` marks the direct reader result and unrelated primitive exports as `primitive`; `isAllowedProgram` requires exported values to be primitive but does not require the `sourceText` export to derive from the reader result.
- `src/source-observation-plan.js:327–345`: `inspectDeclarations` counts FunctionDeclaration and VariableDeclarator bindings, but omits imports and classes.
- The producer labels the event `SourceMirrorRead` with `ExactSource`, but sets `effectiveDispatchStatus:'unknown-or-mutable'` and `effectiveOperationRef.kind:'unknown'`; its HostContractRef contains a caller-declared pristine-intrinsics premise and the test confirms `intrinsicSnapshotId:null`. Under the canonical [carrier/effect contract](../workplace/source-observer-carrier-effect-contract-2026-11-23.md), unresolved dispatch is an `UnknownHostEffect` fallback unless the effective intrinsic is verified under a trusted HostContract. The current test is therefore a pristine-realm compatibility premise, not proof that the runtime operation is native or attacker-resistant. The executed `intrinsic-toString-mutation` case confirms that post-pass rebind does not preserve this declared premise.
- `src/source-observation-plan.js:798–860`: `validatePlanSemantics` checks the original mapped source slices and reader/callable relation, but does not revalidate the original source-reader inventory, global `Function` resolution, pristine-intrinsic premise, or the reader-result declaration's `const` kind/reaching writes.
- `src/source-observation-plan.js:887 onward`: `acceptPlannedPass` declares a `Map<string,MappedSourceRange>` input and immediately requires `trackedRanges instanceof Map`, but forwards that value to `advancePlanRanges`, which iterates it as an array of range objects. `src/core.js:2132` initializes `trackedSourceRanges` from `getInitialPlanRanges(...).trackedSourceRanges` (an array) and passes that array at `src/core.js:2149`. The helper therefore returns `null` before semantic validation on every planned pass. The core then restores the pre-pass source and leaves the associated metric at zero (`src/core.js:2310–2350`). The candidate's own positive fixture asserts `properties >= 1`, `bindings >= 1`, and `literals >= 1`, so the advertised integrated-yield path is statically blocked on this snapshot. `package.json`'s `npm test` command uses `node --test test/*.test.js`, which includes `test/source-observation-plan-producer.test.js`; the full Node suite is therefore expected to fail this positive-yield assertion until the transaction contract is corrected. This is an inference from the inspected call path, not an executed `npm test` result. This is a static control-flow conclusion; focused workflow `45392122556` confirmed the JSDoc array/Map incompatibility, but its test step ran only the direct-validator wrapper. The candidate's producer test and full `obfuscateFiles` path were not executed by Agent 4. The first-slice gate in `src/core.js` explicitly rejects selected experimental backends, symbol-key lowering, source-observer islands, and host locking when `experimentalSourceObservationPlan` is enabled; cross-file renaming is also disabled when the plan exists. The only intended source-mutating consumers in this slice are therefore the property, identifier, and string passes above. The rebase should make those three transactional paths work without widening the first-slice architecture.

The candidate also adds `test/source-observation-plan-producer-browser.js`, but `package.json` wires `test:browser` to `node test/browser-integration.js`, and that runner does not import or invoke the new source-observer browser fixture. Neither default test command includes it: `npm test` uses the `test/*.test.js` glob (which excludes this `.js` filename), and `npm run test:browser` invokes `test/browser-integration.js`, which does not import it. A green run of either default suite would therefore not exercise the source-observer browser path. The fixture is currently orphaned; it must be wired into the browser runner (or an explicit script included in the comprehensive workflow) before browser acceptance can be claimed. It does export `main()` and has a `require.main===module` entry guard, so it can be invoked directly as `node test/source-observation-plan-producer-browser.js`. The existing manual workflow already sets `CHROMIUM_BIN=google-chrome` for browser steps; no new browser binary setup is required. It also asserts `emitted.metrics.properties >= 1`, `bindings >= 1`, and `literals >= 1` before launching Chromium. Given the statically established array/Map rejection and rollback, those metrics are expected to be zero on this candidate snapshot, so direct invocation would fail before the browser comparison. This is a static prediction, not an executed browser result; the fixture was not run in Agent 4's focused direct-validator workflow.

## Interpretation

The direct harness establishes that the reviewed candidate's `validatePlanSemantics` accepts all seven synthetic source edits on both operating systems. This does **not** establish that any enabled transform emits them, and the harness bypasses the transaction wrapper. Acceptance by this narrow predicate is an observed fact; whether every synthetic edit belongs to the first-slice source-observer contract is a separate scope decision. The strongest direct source-observer failures are lexical/intrinsic rebinding (`Function` shadows and `Function.prototype.toString` mutation) and addition of an unplanned reader. Export-surface and returned-string edits additionally test module API/general semantic preservation; they require explicit result-flow scope rather than being silently treated as ExactSource-span failures. The producer also accepts linked and disconnected exports while omitting the returned string ValueRef and all value-flow edges; the graph therefore cannot distinguish whether the exported value carries the reader result. A disconnected export may be treated as unrelated by a deliberately narrower plan, but that scope must be explicit. The separate strict JSDoc failure confirms the transaction array/Map mismatch. Agent 3 must resolve the result-flow contract and transaction integration on the same candidate; Agent 10 retains comprehensive acceptance ownership. Agent 4 did not modify the candidate source or run the comprehensive gate.

## Deferred review leads (not executed in this harness)

Agent 50 proposed two further post-pass cases before the direct harness run. They were deliberately not added before executing the pinned harness, in accordance with the Critic stop-line. After the observed run:

- **Callable binding reassignment** is the higher-value follow-up. An assignment to `observed` immediately before the reader can make `Function#toString` observe a replacement function while the original function declaration and reader-call source slices remain unchanged. The reviewed validator checks the argument identifier spelling and declaration count, but does not appear to verify the reaching definition at the reader call. This is a distinct graph obligation (`observedCallableDefinitionRef` must resolve to the same callable definition at that program point). Agent 50 has an independent Node/TypeScript-AST runtime/predicate-mirror witness for this edit, but it has not been executed against the candidate's actual validator. Include it in the rebase acceptance suite if the same narrow source-plan contract is retained.
- **Destructured `Function` shadowing** is a lower-priority syntactic variant of the already executed class/import shadow cases. Agent 50 also has an independent Node/TypeScript-AST runtime/predicate-mirror witness for this binding pattern, but it has not been executed against the candidate's actual validator. It is useful as a regression if the fix uses a recursive binding-identifier collector, but a proper lexical resolver should cover it as part of the same intrinsic-binding proof rather than requiring a separate architecture or broad test expansion.

Neither deferred lead is promoted to an observed validator result. No additional predicted cases were added after the direct harness execution.
