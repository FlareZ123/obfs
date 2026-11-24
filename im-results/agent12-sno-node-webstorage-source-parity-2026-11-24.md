# SNO Node Web Storage source-parity and coercion witnesses

**Status:** Reproducible intermediate counterexamples and controls; test-only branch; no production compiler change.

## Question

Does the current single-file SNO transform preserve callable source exposed by Node's native Web Storage methods and legacy named-property setter, and can safe coercion paths retain unrelated rewrite yield across file boundaries?

## Host contract and execution

The witnesses run Node **22.23.4** with:

- \`--experimental-webstorage\`
- \`--localstorage-file=<temporary file>\`

Native and transformed packages execute through the real \`createSnoLauncher\` hash-checking bootloader. Both one-file and multi-file packages are tested; the multi-file package has exactly one launcher entry (\`entry.cjs\`) which uses CommonJS require to load \`helper.cjs\`. The transformed files are produced by \`obfuscateFiles(..., {mode:'sno'})\`.

This is an opt-in Node runtime contract. It is not evidence that \`localStorage\`, \`sessionStorage\` or \`Storage\` exists in default Node startup.

## Reproduction

- Test: \`test/sno-storage-source-parity.test.js\`
- Strict external JSDoc inclusion: \`jsconfig.external.json\`
- Research branch: \`agent12/sno-storage-source-parity-20261124\`
- Final witness commit: \`8e469ce13e3e98e20ded863fea7937cb378235f7\`
- Focused two-platform validation: [run 45328077396](https://github.com/FlareZ123/obfs/actions/runs/45328077396)

The focused run passed on Ubuntu and Windows, including all twelve focused tests and:

- strict project JSDoc;
- strict external JSDoc (including this test file);
- strict paired/complete-suite runtime-budget evaluator JSDoc.

No production compiler source was modified.

## Findings

### 1. Explicit \`localStorage.setItem\`: function in both DOMString positions

The first fixture resolves \`const storage = globalThis.localStorage\`, captures \`Storage.prototype.setItem\`, and asserts that \`storage.setItem === nativeSetItem\`.

It then:
- calls \`storage.setItem(inspect, 'sno-key-position')\`, passing the function as argument 0;
- calls \`Reflect.apply(nativeSetItem, storage, ['sno-value-position', inspect])\`, passing it as argument 1 through a captured native alias.

The test asserts \`observesFunctionSource(parse(source, 'commonjs')) === false\`. SNO performs five binding rewrites.

Native and emitted executions both return 29 from \`inspect()\` and 7 from the unrelated helper. The native key and value strings contain the original function source; the emitted key and value strings contain the rewritten private binding. The inherited native method identity is verified in both executions.

### 2. Primitive DOMString input: positive control

A separate fixture passes the primitive string \`"literal"\` to native \`localStorage.setItem\`. The scanner returns false, the stored value remains exactly \`"literal"\`, the unrelated helper returns 7, and three bindings are renamed.

This guards against replacing the missed native conversion with a blanket \`.setItem\` refusal.

### 3. Node Storage legacy named-property setter: distinct native route

A fixture performs \`localStorage.snoNamedSource = inspect\`, then reads both \`localStorage.getItem('snoNamedSource')\` and \`localStorage.snoNamedSource\`.

Before the entrypoint runs, a \`--require\` preloader replaces \`Storage.prototype.setItem\` with a function that throws. Both original and SNO executions still complete, each stores the function source, and each reports Storage length 1. The named-property setter therefore bypasses the patched JavaScript \`setItem\` method while still performing its own value conversion.

The scanner returns false. SNO renames three bindings; ordinary function results remain 41 and the unrelated helper remains 9. Native and emitted stored source differ.

This is direct Node evidence that \`storage[key] = value\` is not a JavaScript call to \`storage.setItem\`.

### 4. Own \`toString\` returning a primitive: positive control

A callable with an own \`toString\` hook that checks its receiver and returns \`'own-string'\` stores that constant in both native and emitted executions. The scanner returns false, three bindings are renamed, and ordinary values remain equal.

This is positive only because the hook body is locally visible and does not inspect callable source or active frames.

### 5. Own \`Symbol.toPrimitive\`: conservative refusal

A callable with an own computed \`Symbol.toPrimitive\` hook returning \`'symbol-string'\` stores the same constant in both executions. The scanner returns true and performs zero binding rewrites.

This is a precision/yield limitation, not a source-parity failure: the hook itself returns a primitive and does not read callable source, but the current boolean observer conservatively refuses the entire file because it cannot prove the computed symbol-property/dispatch path.

### 6. Bound callable: target source is not exposed

Passing \`inspect.bind(null)\` to Storage stores Node's native-code marker \`function () { [native code] }\` in both executions. The scanner returns false, three bindings are renamed, and both the bound call result and unrelated helper result remain equal.

This is a positive for exact callable source text only. Bound-function name/length or other callable metadata effects are not tested here and must remain a separate observation dimension.

### 7. Patched Function.prototype.toString: source observation detected

When \`Function.prototype.toString\` is patched to delegate to a captured native implementation, the scanner returns true and performs zero binding rewrites. Native and emitted stored function source remain identical.

### 8. Hook reads native source then returns a primitive: source observation detected

An own \`toString\` hook captures \`Function.prototype.toString.call(this)\` into a host-visible field, then returns the constant \`'discarded'\`. Storage stores only \`'discarded'\`, but the hook separately exposes the original callable source.

The scanner returns true and performs zero binding rewrites. This proves that a primitive conversion result does not imply the hook had no source-observation side effect.

### 9. Shadowed \`Symbol\` spelling: negative control for well-known-symbol resolution

A local \`const Symbol = {toPrimitive:'toPrimitive'}\` makes \`inspect[Symbol.toPrimitive]\` an ordinary string-keyed property, not the well-known \`@@toPrimitive\` symbol. Storage therefore uses inherited Function stringification and exposes the original source.

The scanner conservatively returns true, performs zero rewrites, and native/emitted source remains equal. This is a regression control: a future \`Symbol.toPrimitive\` precision rule must not treat a shadowed local \`Symbol\` as the realm intrinsic.

### 10. Immutable \`Symbol.toPrimitive\` alias: conservative refusal

A fixture captures \`const toPrimitiveKey = Symbol.toPrimitive\` and assigns the pure hook through \`inspect[toPrimitiveKey]\`. The hook returns a primitive and does not inspect source, but the current scanner still returns true and performs zero rewrites.

This is a second precision gap: the existing well-known-symbol alias set does not include \`toPrimitive\`. The SNO witness records both the direct and immutable-alias forms so a future resolver can improve them without regressing the shadowed-\`Symbol\` negative control.

### 11. Node \`sessionStorage\`: same native DOMString conversion

Under the same experimental Web Storage flag, Node exposes \`sessionStorage\` as well as \`localStorage\`. A function passed as the value to \`sessionStorage.setItem\` is converted to native function source; the scanner returns false, native and emitted source differ, and both the function result (73) and unrelated helper result (31) remain equal. The test confirms \`sessionStorage.setItem === Storage.prototype.setItem\` in both runs.

### 12. Multi-file SNO factory return: one launcher entry, cross-file callable source leak

A two-file package has one executable \`entry.cjs\` and a required \`helper.cjs\`. The helper exports a factory; the entry calls it and receives a nested \`inspect\` function. The entry passes that returned callable to native \`localStorage.setItem\`.

The per-file observer reports false for both source files. SNO rewrites the helper-private \`privateLocal\` binding; native and emitted Storage strings differ, while the returned callable still returns 83 and the unrelated entry helper returns 5. The actual \`createSnoLauncher\` verifies both package files and executes only \`entry.cjs\`, which loads \`helper.cjs\` through CommonJS require.

This is a cross-file/interprocedural source-observation counterexample in the prescribed one-entry SNO architecture: the callable is created in a helper module, returned through a function call, and consumed by a native WebIDL sink in the entry module.

## Test-harness correction

An intermediate test revision put a potentially uncaught \`throw new Error(...)\` inside the obfuscated source to assert native method identity. That correctly activated the existing uncaught-diagnostic/source-coordinate observer in \`src/ast.js:2627-2631\`, so the scanner returned true. It was a harness-induced conservative refusal, not evidence about Storage conversion.

The final fixtures report receiver identity as a non-throwing boolean and assert it in the parent harness. The named-setter method-bypass control puts its throwing trap in an external preloader, not in the obfuscated source.

The multi-file fixture's source list is explicitly JSDoc-typed with the CommonJS literal; without this annotation the external JSDoc checker widened \`sourceType\` to string and rejected the fixture. The corrected 12-test run passes on both platforms.

## Interpretation and limitations

These are SNO **compatibility and precision** observations for Node 22.23.4 with opt-in Web Storage. They are not security theorems: the SNO threat model grants the server owner access to the runtime, filesystem and memory.

The test exercises the SNO core transform and the actual \`createSnoLauncher\` single-entry hash-checking bootloader, including a multi-file package. It does not exercise the complete \`bin/sno.js\` CLI's input-tree traversal/preflight. It does not cover:

- every own/inherited accessor or Proxy receiver combination;
- browser engines or SCO request-time execution;
- full-suite compatibility or the 2.5× runtime budget.

Existing browser Storage reports cover additional COO/SCO value-hook and named-setter controls; Agent19's SCO handler witness remains a separate gate. Agent9's HostHeldCallable witness is also complementary: an unknown host can inspect a callback's source without invoking it, whereas Storage here is a known WebIDL conversion path.

## Effect-model consequence

The SNO host profile should be a versioned host contract for Node Web Storage with the required feature flag. The shared plan should distinguish:

- \`WebIDLStringConversion\` for each explicit \`Storage.setItem\` argument, with argument index, key/value role, receiver and effective native/userland operation;
- \`WebIDLNamedPropertySet\` for legacy named-property assignment, independently of the JavaScript \`setItem\` property;
- nested \`ToPrimitiveDispatch\` for object/function values, including the effective \`@@toPrimitive\`, \`toString\` and \`valueOf\` hooks;
- cross-file/cross-module callable return and alias edges, so a sink in the entry module closes over a callable defined in a helper;
- separate \`ExactSource\`, \`CallableMetadata\` and \`FramePosition\` effects.

A callable source effect is present only when the actual conversion path reaches native Function stringification or a hook reads source as a side effect. A primitive string, a locally proved pure own \`toString\`, and a bound function's native-code marker are source-text positives. A custom hook returning a primitive is positive only when its body and dispatch are proved not to observe callable source or active frames. Unknown/mutable hooks remain \`UnknownHostEffect\`.

For \`Symbol.toPrimitive\`, a future precision path must resolve the exact \`Symbol\` reference to the unshadowed realm intrinsic or a proved immutable alias. Current \`isSymbolConstructor\` is name-based; it must not be reused as a binding proof. Keep the shadowed-\`Symbol\` fixture as a negative control. Analyze the hook body before omitting \`ExactSource\`.

For named-property assignment, keep ECMAScript \`ToPropertyKey\` on the property key separate from Web IDL conversion of the assigned value. The preloader test shows that replacing \`Storage.prototype.setItem\` does not intercept the named-property setter.

**Conclusion:** SNO now has focused, cross-platform evidence for explicit Storage conversion in both argument positions, captured native aliases, the distinct named-property setter under a patched-method preloader, primitive and own-hook positives, bound-callable source behavior, source-observing hook negatives, direct/aliased/shadowed Symbol controls, sessionStorage, and a multi-file factory-return path through one launcher entry. The repository-wide verdict remains **NO-GO / RELEASE-BLOCKED** pending the shared effect graph, broader mode-specific acceptance, and adversarial performance evidence.
