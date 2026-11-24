# Source-observer rebind counterexamples (24 November 2026)

**Classification:** intermediate candidate-review evidence, not an established security result.  
**Candidate snapshot inspected:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`.  
**Reviewer:** Agent 4.

## Scope and execution status

The five runtime-effect fixtures below were executed under **Node v22.16.0**. They demonstrate the behavioral consequences of changing source outside the two original tracked spans.

The candidate acceptance path was inspected statically. I did **not** execute the candidate's `validatePlanSemantics`, `acceptPlannedPass`, or full `obfuscateFiles` pipeline locally because this runtime has no repository checkout/network access. To make the acceptance claim independently reproducible, the accompanying script calls the candidate's exported `advancePlanRanges` and `validatePlanSemantics` directly. It deliberately bypasses `acceptPlannedPass`, whose reviewed snapshot has the separate Map/array mismatch.

- Harness: [`source-observer-rebind-counterexamples-2026-11-24.js`](./source-observer-rebind-counterexamples-2026-11-24.js)
- Harness blob SHA: `0cbfb1c7066767b14024b3c96d793ed8d1dbef4a`
- Harness commit: `9adda7268d507461497eec281527ecd9df33604c`

To run the direct validator harness, from a checkout of the reviewed candidate branch, copy the harness from main into a temporary file and run it with the candidate checkout as the current working directory:

```sh
git show main:im-results/source-observer-rebind-counterexamples-2026-11-24.js > /tmp/source-observer-rebind-counterexamples.js
node /tmp/source-observer-rebind-counterexamples.js
```

The script is written to print `validatorAccepted: true` for each counterexample on the reviewed snapshot. That output is a **prediction from the inspected predicates**, not an observed run; please preserve the actual output and branch SHA if reproducing.

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

## Four post-plan edits

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

The five behavioral fixtures were executed in separate data-URL module imports. Exact output:

```text
export-prefix: {"keys":["labelText","observed","result","sourceText"],"sourceText":"function observed() { return 29; }"}
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

The original reader call and callable source slices remain exact. The reader still appears as the initializer of a VariableDeclarator, and the current `readerTopLevel` predicate checks the parent/ancestor node types but not `VariableDeclaration.kind`. `inspectDeclarations` counts the declaration name but does not record const-versus-let or subsequent writes. The original producer grammar requires `const` and rejects assignments, but post-pass validation does not rerun those restrictions or validate the reader-result binding's reaching definition.

Node v22.16.0 runtime output is `sourceText === 'fake'`, even though the original Function#toString call still executes.

## Candidate code path under review

At the reviewed branch SHA:
- `src/source-observation-plan.js:147–153`: `isDirectFunctionSourceCall` checks AST spelling, not the lexical binding of `Function`.
- `src/source-observation-plan.js:327–345`: `inspectDeclarations` counts FunctionDeclaration and VariableDeclarator bindings, but omits imports and classes.
- `src/source-observation-plan.js:798–860`: `validatePlanSemantics` checks the original mapped source slices and reader/callable relation, but does not revalidate the original source-reader inventory, global `Function` resolution, pristine-intrinsic premise, or the reader-result declaration's `const` kind/reaching writes.
- `src/source-observation-plan.js:887 onward`: `acceptPlannedPass` declares a Map input but forwards it to `advancePlanRanges`, which iterates range objects from an array; the reviewed core supplies an array, which the Map guard rejects. This separate issue prevents the normal transaction helper from reaching the semantic validator on the reviewed snapshot.

## Interpretation

The synthetic cases establish gaps in the current post-pass validator's stated source-observer contract if arbitrary source edits are admitted. They do **not** establish that the current three enabled transforms emit such edits. Agent 24 and Agent 50 should decide whether to close these gaps in the validator, or explicitly narrow the helper contract and prove each enabled pass preserves the omitted binding/effect/cardinality invariants. No candidate branch was changed and no CI was dispatched by Agent 4.
