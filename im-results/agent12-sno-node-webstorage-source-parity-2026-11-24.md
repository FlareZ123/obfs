# SNO Node Web Storage source-parity witnesses

**Status:** Reproducible intermediate counterexamples; test-only branch; no production compiler change.

## Question

Does the current single-file SNO transform preserve callable source exposed by Node's native Web Storage methods and legacy named-property setter, and can primitive inputs retain unrelated rewrite yield?

## Host contract and execution

The witnesses run Node **22.23.4** with:

- \`--experimental-webstorage\`
- \`--localstorage-file=<temporary file>\`

The test builds original and transformed one-entry packages using the real \`createSnoLauncher\` hash-checking bootloader, then executes each \`sno-entry.cjs\`. The transformed entry is produced by \`obfuscateFiles(..., {mode:'sno'})\`.

This is an opt-in Node runtime contract. It is not evidence that \`localStorage\` or \`Storage\` exists in default Node startup.

## Reproduction

- Test: \`test/sno-storage-source-parity.test.js\`
- Strict external JSDoc inclusion: \`jsconfig.external.json\`
- Research branch: \`agent12/sno-storage-source-parity-20261124\`
- Final source pin: \`10a89096bcb0272752a57ef2c85441c606f24197\`
- Focused two-platform validation: [run 45324535207](https://github.com/FlareZ123/obfs/actions/runs/45324535207)

The focused run passed on Ubuntu and Windows, including:

- all three focused SNO tests;
- strict project JSDoc;
- strict external JSDoc (including this test file);
- strict paired/complete-suite runtime-budget evaluator JSDoc.

No production compiler source was modified.

## Findings

### 1. Explicit \`Storage.setItem\`: function in both DOMString positions

The first fixture resolves \`const storage = globalThis.localStorage\`, captures \`Storage.prototype.setItem\`, and asserts that \`storage.setItem === nativeSetItem\`.

It then:
- calls \`storage.setItem(inspect, 'sno-key-position')\`, passing the function as argument 0;
- calls \`Reflect.apply(nativeSetItem, storage, ['sno-value-position', inspect])\`, passing it as argument 1 through a captured native alias.

The test asserts \`observesFunctionSource(parse(source, 'commonjs')) === false\`. SNO performs five binding rewrites.

Native and emitted executions both return 29 from \`inspect()\` and 7 from the unrelated helper. The native key and value strings both contain:

\`\`\`text
function inspect(){const privateLocal=29;return privateLocal;}
\`\`\`

The emitted key and value strings both contain:

\`\`\`text
function inspect(){const _vea855b3f3af5=29;return _vea855b3f3af5;}
\`\`\`

The inherited native method identity is verified in both executions. The changed function source is therefore visible through both DOMString conversion positions, including the captured-native \`Reflect.apply\` route.

### 2. Primitive DOMString input: positive control

A separate fixture passes the primitive string \`"literal"\` to native \`localStorage.setItem\`. The scanner returns false, the stored value remains exactly \`"literal"\`, the unrelated helper returns 7, and three bindings are renamed.

This guards against replacing the missed native conversion with a blanket \`.setItem\` refusal.

### 3. Node Storage legacy named-property setter: distinct native route

A third fixture performs \`localStorage.snoNamedSource = inspect\`, then reads both \`localStorage.getItem('snoNamedSource')\` and \`localStorage.snoNamedSource\`.

Before the entrypoint runs, a \`--require\` preloader replaces \`Storage.prototype.setItem\` with a function that throws. Both original and SNO executions still complete, each stores the function source, and each reports Storage length 1. The named-property setter therefore bypasses the patched JavaScript \`setItem\` method while still performing its own value conversion.

The scanner returns false for the source. SNO renames three bindings; ordinary function results remain 41 and the unrelated helper remains 9. The native stored source contains \`privateLocal\`; the emitted stored source contains the renamed binding.

This is direct Node evidence that \`storage[key] = value\` is not a JavaScript call to \`storage.setItem\`.

## Test-harness correction

An intermediate test revision put a potentially uncaught \`throw new Error(...)\` inside the obfuscated source to assert native method identity. That correctly activated the existing uncaught-diagnostic/source-coordinate observer in \`src/ast.js:2627-2631\`, so the scanner returned true. It was a harness-induced conservative refusal, not evidence about Storage conversion.

The final fixtures report receiver identity as a non-throwing boolean and assert it in the parent harness. The named-setter method-bypass control puts its throwing trap in an external preloader, not in the obfuscated source.

## Interpretation and limitations

These are SNO **compatibility** counterexamples for Node 22.23.4 with opt-in Web Storage. They are not security theorems: the SNO threat model grants the server owner access to the runtime, filesystem and memory.

The test exercises the SNO core transform and the actual \`createSnoLauncher\` single-entry hash-checking bootloader. It does not exercise the complete \`bin/sno.js\` CLI's input-tree traversal/preflight or a multi-file package. It does not cover:

- \`sessionStorage\`;
- own \`toString\`, own \`Symbol.toPrimitive\`, bound-function or patched \`Function.prototype.toString\` value hooks in SNO;
- all proxy receiver/forwarding variants;
- browser engines or SCO request-time execution;
- full-suite compatibility or the 2.5× runtime budget.

Existing browser Storage reports cover several value-hook, browser named-setter, COO and SCO cases, but they do not substitute for these SNO host results.

## Effect-model consequence

The SNO host profile should be a versioned host contract for Node Web Storage with the required feature flag. The shared plan should distinguish:

- \`WebIDLStringConversion\` for each explicit \`Storage.setItem\` argument, with argument index, key/value role, receiver and effective native/userland operation;
- \`WebIDLNamedPropertySet\` for legacy named-property assignment, independently of the JavaScript \`setItem\` property;
- nested \`ToPrimitiveDispatch\` for object/function values, including the effective \`@@toPrimitive\`, \`toString\` and \`valueOf\` hooks.

A callable source effect is present only when the actual conversion path reaches native Function stringification. A primitive string is a no-source-observation positive. A custom hook returning a primitive is positive only when its body and dispatch are proved not to observe callable source or active frames; merely observing a primitive return is insufficient. Unknown/mutable hooks remain \`UnknownHostEffect\`.

For named-property assignment, keep ECMAScript \`ToPropertyKey\` on the property key separate from Web IDL conversion of the assigned value. The preloader test shows that replacing \`Storage.prototype.setItem\` does not intercept the named-property setter.

**Conclusion:** SNO now has focused, cross-platform evidence for explicit Storage method conversion in both argument positions, a captured native alias, primitive positive yield, and the distinct named-property setter under a patched-method preloader. The repository-wide verdict remains **NO-GO / RELEASE-BLOCKED** pending the shared effect graph, broader mode-specific acceptance, and adversarial performance evidence.
