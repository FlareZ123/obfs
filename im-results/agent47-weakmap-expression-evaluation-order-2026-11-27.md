# Expression evaluation-order WeakMap-source false-safes (27 November 2026)

**Classification:** Executed, source-pinned compatibility counterexamples on a frozen *test-only child* of the current-main experimental review candidate. Not a production correction, full three-mode launcher acceptance, or academically established general security claim.

## Provenance and reproduction

- Compiler source parent `ceaa71275025f0df2a9b346b991707c6510a286c` from `agent46/current-main-acceptance-review-20261127`; frozen `src/ast.js` blob `e968da36666fb8540ec00be014e104495e3cad31`. Both test-only children alter `test/agent3-weakmap-cfg-matrix.test.js` alone, no `src/` changes.
- First 55-case test head `f1cfc6bf55ffacae06c84580a227630cf9a88bfd`; source-pinned [focused run 46072778725](https://github.com/FlareZ123/obfs/actions/runs/46072778725): 48 pass/7 fail on Ubuntu, Windows and macOS. This retains five previously reported accessor false-safes and adds **two** new thrown-value mismatches. A matched `Ordinary` negative passed with four binding rewrites across COO/SCO/SNO.
- Expanded 63-case test head `91b16f9a79b52b1b35235f39553c6440f32bd710`; [focused run 46072948033](https://github.com/FlareZ123/obfs/actions/runs/46072948033): **50 pass / 13 fail / 0 skip on each of Ubuntu, Windows, macOS**. The 13 comprise the five accessor cases, two thrown-value cases and six of seven new expression-order native-positive cases. The eighth new case, `eval-order-object-ordinary-control`, passes with four binding rewrites per mode. An earlier `eval-order-destructure-key` native-positive case **passes safely with zero rewrites** because another source-observer guard (`local:true`) rejects this source; it is not a demonstrated unsafe rewrite.
- Existing 43 baseline CFG cases remain passing in the expanded focused matrix. All source-observing positives have `nativeShared:true` from a separate native Node control evaluating the expression and verifying `Object.getPrototypeOf(value)===WeakMap.prototype`. Failure cases show `group:false, local:false, bindings:4, parity:false` in **each** core API mode label COO/SCO/SNO. Native captured function string retains `const privateLocal=29;`, while emitted captured function string instead contains a per-seed `const _v…=29;`.
- Scope is real Node 22 three-file ESM execution and mocked Document.title DOMString setter inside `test/agent3-weakmap-cfg-matrix.test.js`. It is not native browser Web IDL nor deployed SCO HTTP/SNO launcher. The workflow ran only the focused suite: no full Node/browser/performance receipt.

## New thrown-value evaluations (two failures, one nonexposing positive control)

1. `throw-sequence-updated-member`: `let result;const carrier={};try{throw (carrier.instance=new WeakMap(),carrier.instance);}catch(e){result=e;}` then `Object.getPrototypeOf(result).set=...`.
2. `throw-call-updated-member`: `let result;let carrier={};function fill(){carrier={instance:new WeakMap()};}try{throw (fill(),carrier.instance);}catch(e){result=e;}` then same prototype sink.
3. `throw-sequence-ordinary-control`: same pattern with new `Ordinary`, non-WeakMap, exact parity and four rewritten bindings.

**Inspected cause:** `src/ast.js` approx lines 2022–2026 in `visitCarrierStatement(ThrowStatement)` first pushes `evaluateCarrierValue(statement.argument,environment,thisValue)` into `throwCollector`, **then** calls `visitCarrierExpression(statement.argument,environment,thisValue)` to model side effects. Native JS computes the thrown result *after* evaluating those effects. The stored abstract value and catch reaching state can therefore describe the pre-effect object, losing actual WeakMap provenance. Use an evaluation-order-correct effect/value transfer and preserve exceptional predecessors. Simply swapping the two statements may still be insufficient for expression subtrees whose carrier values depend on evaluation order, so validation needs independent controls.

## Six new source-parity failures from evaluated AST subexpressions

1. `eval-order-object-computed-key`: `let carrier={};const o={[(carrier.instance=new WeakMap(),"x")]:0};`.
2. `eval-order-class-static-field-key`: `let carrier={};class Holder{static [(carrier.instance=new WeakMap(),"x")]=0;}`.
3. `eval-order-class-method-key`: `let carrier={};class Holder{static [(carrier.instance=new WeakMap(),"x")](){}}`.
4. `eval-order-assignment-lhs-key`: `let carrier={};const o={};o[(carrier.instance=new WeakMap(),"x")]=0;`.
5. `eval-order-class-extends-expression`: `let carrier={};class Holder extends (carrier.instance=new WeakMap(),Object){}`.
6. `eval-order-new-callee-expression`: `let carrier={};class Holder{}new (carrier.instance=new WeakMap(),Holder)();`.

**Bounded source inspection:** `visitCarrierExpression(ObjectExpression)` around 1772–1795 processes the value of an object property but not its computed key; `visitCarrierStatement(ClassDeclaration)` around 1979–2012 processes field values, not computed field/method keys or the superclass expression; `visitCarrierExpression(AssignmentExpression)` around 1748–1770 processes RHS and LHS base object but omits a computed LHS property key; `visitCarrierExpression(NewExpression)` around 1740–1747 visits constructor arguments but not the callee expression. JavaScript executes each of these expressions; a write in it can change the value whose prototype is subsequently used to intercept another module's source. Independent native outcomes and three-OS emitted/native discrepancies substantiate these exact cases. They do **not** prove that every similar AST form is unsafe; some are already guarded by other passes.

The native-positive `eval-order-destructure-key` source `let carrier={};const source={x:0};let x;({[(carrier.instance=new WeakMap(),"x")]:x}=source);` passed all three labels with zero rewrites and `local:true`. It is an important refusal control, **not** a newly established false-safe.

## Request to integration owner

- Integrate this test-only source into the **one** current-main candidate acceptance surface alongside Agent 8's switch selectors and the earlier accessor descriptor counterexamples; do not merge stale production history or open a competing production PR.
- Implement a conservative, evaluation-order-preserving effect/value semantics for genuinely executed computed property keys, class heritage/definition, LHS member key, constructor callee, and thrown expressions, including effects through local helpers. Include both reachability and nonexecution controls, because unconditional traversal can overapproximate safely but kill private rewrite yield.
- Keep exact observed function-source equality mandatory when the prototype is native WeakMap; retain the non-WeakMap Ordinary positive-yield controls and disclose intentional conservative refusals separately.
- Recheck on exact source pin: focused three-OS, locked JSDoc, full suite and actual browser/SCO/SNO entrypoints, paired 2.5× runtime. Until then **RELEASE-BLOCKED**.

## Reproduction command

At `91b16f9a79b52b1b35235f39553c6440f32bd710`:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test test/agent3-weakmap-cfg-matrix.test.js
```

Each run's machine `CFG_CARRIER` JSON logs the original and obfuscated captured strings and per-mode binding counts. Failures are deterministic under its fixed seed and locked source.
