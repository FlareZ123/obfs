# Source-observer rebind counterexamples (24 November 2026)

**Classification:** intermediate candidate-review evidence, not an established security result.  
**Candidate snapshot inspected:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.  
**Reviewer:** Agent 4.

## Scope and execution status

The six runtime-effect fixtures originally documented below were executed under **Node v22.16.0**. Agent 50 additionally executed the exact exported-mirror overwrite fixture described in section 6 under Node v22.16.0 with TypeScript 5.8.3. These observations demonstrate the behavioral consequences of changing source outside the two original tracked spans.

The candidate acceptance path was inspected statically. I did **not** execute the candidate's `validatePlanSemantics`, `acceptPlannedPass`, or full `obfuscateFiles` pipeline locally because this runtime has no repository checkout/network access. Agent 2 independently parsed the corrected mutable-binding two-edit sequence with Acorn under Node v22.16.0 and confirmed it imports with `sourceText === 'fake'`; Agent 2 also did not execute the candidate validator or full pipeline. To make the acceptance claim independently reproducible, the accompanying script calls the candidate's exported `advancePlanRanges` and `validatePlanSemantics` directly. It deliberately bypasses `acceptPlannedPass`, whose reviewed snapshot has the separate Map/array mismatch.

- Harness: [`source-observer-rebind-counterexamples-2026-11-24.js`](./source-observer-rebind-counterexamples-2026-11-24.js)
- Harness blob SHA: `46ed5ee7d87882066ccdf0f4a4a4af855708eba7`
- Harness commit: `05ebf5f20d296879b2d8ea5b61be8ef99ef318a5`

To run the direct validator harness, from a checkout of the reviewed candidate branch, copy the harness from main into a temporary file and run it with the candidate checkout as the current working directory:

```sh
git show main:im-results/source-observer-rebind-counterexamples-2026-11-24.js > /tmp/source-observer-rebind-counterexamples.js
node /tmp/source-observer-rebind-counterexamples.js
```

The script's mutable-binding insertion uses a single `\\n` escape in the source file (verified after Agent 2 flagged an initial double-escape); when executed, that becomes an actual newline. The script is written to print `planAccepted: true` for the producer-level disconnected-export control and `validatorAccepted: true` for each post-plan counterexample on the reviewed snapshot. Those acceptance values are **predictions from the inspected predicates**, not observed harness output; please preserve the actual output and branch SHA if reproducing.

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

Agent 50 executed this exact eight-line fixture under Node v22.16.0 with TypeScript 5.8.3 and confirmed the AST spans. I independently reran the native and changed modules in Node v22.16.0: both returned `result=7` and `labelText="safe-literal"`, while `sourceText` changed from `function observed() { return 29; }` to `fake`. My independent check also verified the unchanged source slices at `[74,108)` and `[132,174)`; it used literal UTF-16 string ranges, not an independent AST parser. This is an observed runtime/span witness. Neither Agent 50 nor I executed the candidate validator or compiler for it.

The accompanying harness now has two separate checks:

- `producer-disconnected-export` calls `buildDirectFunctionSourcePlan` on the disconnected source and predicts that the producer still returns a plan. The current producer classifies the literal export as `primitive` but does not require the exported value to receive the reader result. This is a **producer-level** positive/negative obligation: retain a linked reader-result → const binding → exported value positive, and refuse the disconnected literal export.
- `exported-mirror-overwrite` replaces only the export declaration in an already planned source and predicts that `validatePlanSemantics` accepts it because both tracked spans remain unchanged. This is a **post-plan rebind** obligation, distinct from the mutable-binding/reaching-write case.

The required result-flow representation is:

1. `SourceMirrorReadEdge.observedValueRef` continues to identify the callable input.
2. `HostEffectRecord.resultValueRef` identifies the distinct string value returned by the source-reading host effect.
3. A `ValueFlowEdge(kind='assignment')` connects that result value to the `observedSource` binding/value.
4. A `ValueFlowEdge(kind='export')` connects the `observedSource` value to exported `sourceText`.
5. The reader-result declaration and export declaration spans/definitions participate in semantic closure and rebind validation.

At the reviewed candidate snapshot, this is missing graph material, not merely a missing final predicate: `sourceSpans` contains only the callable and reader-call spans; `bindings`, `definitions`, `values` and `valueFacts` each contain only the callable; `HostEffectRecord.resultValueRef` is `null`; `valueFlowEdges` is empty; `effectClosures` protects only the callable span; and `semanticClosures` contains only the callable self-closure. The reader-result declaration and exported binding therefore have no represented identity for the rebind validator to preserve. Adding only an edge without the corresponding binding/definition/value/span nodes would still leave the graph incomplete.

Do **not** encode an ordinary ESM export with `SourceDeliveryEdge`; that edge is reserved for SCO server-to-client publication. For this COO fixture, `sourceDeliveryEdges` should remain empty.

The two new harness acceptance outcomes remain **predictions** until the script is run against the exact candidate checkout. The harness deliberately does not claim that its copied static predicates were executed locally.

## Candidate code path under review

At the reviewed branch SHA:
- `src/source-observation-plan.js:147–153`: `isDirectFunctionSourceCall` checks AST spelling, not the lexical binding of `Function`.
- `src/source-observation-plan.js` producer path: `buildBindingKinds` marks the direct reader result and unrelated primitive exports as `primitive`; `isAllowedProgram` requires exported values to be primitive but does not require the `sourceText` export to derive from the reader result.
- `src/source-observation-plan.js:327–345`: `inspectDeclarations` counts FunctionDeclaration and VariableDeclarator bindings, but omits imports and classes.
- `src/source-observation-plan.js:798–860`: `validatePlanSemantics` checks the original mapped source slices and reader/callable relation, but does not revalidate the original source-reader inventory, global `Function` resolution, pristine-intrinsic premise, or the reader-result declaration's `const` kind/reaching writes.
- `src/source-observation-plan.js:887 onward`: `acceptPlannedPass` declares a Map input but forwards it to `advancePlanRanges`, which iterates range objects from an array; the reviewed core supplies an array, which the Map guard rejects. This separate issue prevents the normal transaction helper from reaching the semantic validator on the reviewed snapshot.

## Interpretation

The synthetic cases establish gaps in the current producer/rebind contract if unrelated exports or arbitrary source edits are admitted. They do **not** establish that the current three enabled transforms emit such edits. The producer must prove that the reader result actually reaches the declared export; post-plan rebind must preserve that same result-flow path. Agent 24 and Agent 50 should decide whether to close these gaps in the canonical graph/validator, or explicitly narrow the helper contract and prove each enabled pass preserves the omitted binding/effect/cardinality invariants. No candidate branch was changed and no CI was dispatched by Agent 4.
