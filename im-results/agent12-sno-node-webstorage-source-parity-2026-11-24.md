# SNO Node Web Storage source-parity witness

**Status:** Reproducible intermediate counterexample; test-only branch; no production compiler change.

## Question

Does the current single-file SNO transform preserve the observable source of a callable passed to Node's native Web Storage implementation, and can a primitive value still retain unrelated rename yield?

## Host contract and method identity

The witness runs Node **22.23.4** with both opt-in flags:

- \`--experimental-webstorage\`
- \`--localstorage-file=<temporary file>\`

It asserts that \`localStorage.setItem === Storage.prototype.setItem\` in both native and transformed processes. This isolates the inherited native Storage method rather than a same-named userland wrapper.

This is an opt-in Node runtime contract. It is not evidence that \`localStorage\` or \`Storage\` exists in default Node startup, nor that Node implements the browser's Storage named-property setter.

## Reproduction

- Test: \`test/sno-storage-source-parity.test.js\`
- Strict external JSDoc inclusion: \`jsconfig.external.json\`
- Research branch: \`agent12/sno-storage-source-parity-20261124\`
- Final test/config commit: \`40fe825f4310548d0c440dcf2a27e600d75619f6\`
- Focused two-platform validation: [run 45323625111](https://github.com/FlareZ123/obfs/actions/runs/45323625111)

The focused run passed on Ubuntu and Windows, including:

- the two focused SNO tests;
- strict project JSDoc;
- strict external JSDoc (including this test file);
- strict paired/complete-suite runtime-budget evaluator JSDoc.

No production compiler source was modified.

## Findings

### Function-valued DOMString input: source parity failure

The test explicitly asserts:

- \`observesFunctionSource(parse(source, 'commonjs')) === false\`;
- the effective method is native inherited \`Storage.prototype.setItem\`;
- SNO performs identifier rewrites;
- ordinary results remain equal;
- the stored function source differs.

Node 22.23.4 produced:

\`\`\`text
nativeStored:
function inspect(){const privateLocal=29;return privateLocal;}

emittedStored:
function inspect(){const _vea855b3f3af5=29;return _vea855b3f3af5;}
\`\`\`

Both executions returned 29 from \`inspect()\` and 7 from the unrelated helper. The SNO output renamed four bindings. The native Storage conversion therefore exposes the changed callable source while ordinary return-value behavior remains equal.

### Primitive DOMString input: positive control

A separate source passes the primitive string \`"literal"\` to native \`localStorage.setItem\`. The scanner returns false, the stored value remains exactly \`"literal"\`, the unrelated helper returns 7, and three bindings are renamed.

This guards against replacing the missed native conversion with a blanket \`.setItem\` refusal.

## Test-harness correction

An intermediate test revision put a potentially uncaught \`throw new Error(...)\` inside the source to assert native method identity. That correctly activated the existing uncaught-diagnostic/source-coordinate observer in \`src/ast.js\`, so the scanner returned true. It was a harness-induced conservative refusal, not evidence about Storage conversion.

The final fixture instead reports a non-throwing \`nativeDispatch\` boolean and asserts it in the parent test. The final source-observer assertion is false and the source mismatch reproduces on both operating systems.

## Interpretation and limitations

This establishes one SNO **compatibility** counterexample for Node 22.23.4 with opt-in Web Storage. It does not establish a security theorem: the SNO threat model grants the server owner access to the runtime, filesystem and memory.

The test exercises the core \`obfuscateFiles(..., {mode:'sno'})\` single-file transform and directly executes its emitted code. It does not test the complete \`bin/sno.js\` package/manifest launcher. It does not cover:

- browser Storage named-property assignment;
- Node named-property setter semantics;
- \`sessionStorage\`;
- captured-native aliases, \`.call/.apply/.bind\`, or Proxy-forwarded receivers in SNO;
- pre-module host patching;
- multi-file SNO package execution;
- SCO request-time execution or COO browser execution.

Existing browser-side Storage reports cover several of those distinct paths, but they do not substitute for this SNO host result.

## Effect-model consequence

The SNO host profile should be a versioned host contract for Node Web Storage with the required feature flag. The shared plan should emit a \`WebIDLStringConversion\` effect for each relevant DOMString argument, with:

- source-qualified receiver identity and \`Storage\` interface identity;
- effective native/userland operation identity and dispatch provenance;
- \`conversionTarget: 'DOMString'\`;
- argument index and operand role (\`key\` versus \`value\`);
- trigger-value and observed-value edges;
- a nested \`ToPrimitiveDispatch\` when the input is an object/function.

A callable source effect is present only when the conversion path reaches native Function stringification. A primitive string is a no-source-observation positive. A locally proved own \`toString\` returning a primitive can also be a positive; unresolved \`@@toPrimitive\`, receiver, or prototype dispatch remains \`UnknownHostEffect\`.

Do not infer native dispatch from the spelling \`.setItem\`. Browser \`storage[key] = value\` is a separate \`WebIDLNamedPropertySet\` route: ECMAScript converts the key first, and the native named setter converts the assigned value. It does not look up the JavaScript \`storage.setItem\` property.

**Conclusion:** SNO now has a focused, cross-platform Node Storage source-parity witness. The repository-wide verdict remains **NO-GO / RELEASE-BLOCKED** pending the shared effect graph, broader mode-specific acceptance, and adversarial performance evidence.
