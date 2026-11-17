# Native JSON function-source coercion: defensive admission control (2026-11-17)

**Classification:** intermediate semantic-correctness regression and finite guard. This is no obfuscation security claim.

## Source-observation mechanism

ECMA-262's [JSON.parse](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse) converts its first argument with `ToString(text)`. With a function-valued argument, conversion obtains the function's native source text. The resulting invalid JSON may produce a runtime `SyntaxError.message` containing a source excerpt. Renaming a function or rewriting its body can therefore change the observable string, even though the user code never calls `.toString()` explicitly. This matters for a one-to-one-preserving JavaScript obfuscator.

ECMAScript 2026 also defines [JSON.rawJSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/rawJSON) with a JSON-text input. Node 22.16.0's error message demonstrably exposes the same first bytes of a function passed as its argument. Method identity is recoverable through direct property references, selected computed keys, aliases, destructuring, and native `.call/.apply/.bind`. Unknown computed JSON methods must be conservatively treated as potentially source-coercing because the runtime key may select either `parse` or `rawJSON`.

## Pinned red and green controls

- [Red run 44105608945](https://github.com/FlareZ123/obfs/actions/runs/44105608945), pinned SHA `0e3ba8dd92746a403e3756eb521002cb7a2e80bd`: original `observesFunctionSource` returned **false** for a direct `JSON.parse(protectedLabel)`. The native exact-source error text changed after a function rename. Both OS runners passed the primitive literal positive control; their test jobs each had exactly one failed JSON.parse observation assertion.
- New `src/ast.js` analysis tracks JSON namespace aliases, direct `JSON.parse`, detached methods, destructuring, `.call/.apply`, and `.bind` through monotone alias propagation. An unresolved or function-valued argument refuses rewriting; a proven primitive does not.
- [Green run 44105948998](https://github.com/FlareZ123/obfs/actions/runs/44105948998), pinned SHA `bf89da9d373feda0447ca03383d24b6688027d9d`, passed both Ubuntu/Windows differential and strict JSDoc stages, and Ubuntu's real Chromium/CSP stages. The initial 10-case JSON.parse source-coercion matrix checked original vs transformed COO and SNO runtime error messages; no mismatch was observed. Subsequent ES2026 rawJSON and computed-key controls extended that matrix to 17 selected invocation shapes. The proven primitive positive control retained a nontrivial transform.

### Extended ES2026 rawJSON and computed-member red/green

- [RawJSON red 44106752014](https://github.com/FlareZ123/obfs/actions/runs/44106752014), SHA `11fa99575d3f884c24b4c521bbd6f8fb11edcfb0`: direct `JSON.rawJSON(protectedLabel)` was an unrecognized source observer on both runners; primitive controls passed.
- [RawJSON green 44107084107](https://github.com/FlareZ123/obfs/actions/runs/44107084107), SHA `428621eb2f8c85fff5d78bfa0aea391e3a6642f3`: both runners passed the extended rawJSON and JSON.parse matrix, strict JSDoc and browser CSP stages. No preexisting public backend default changed.
- [Dynamic member red 44107361591](https://github.com/FlareZ123/obfs/actions/runs/44107361591), SHA `1d197f302e4fde06ccb282e06caf720b35b1db92`: `JSON[method](protectedLabel)` with a runtime-computed key escaped admission control; both runners failed exactly this new recognition assertion.
- [Dynamic member green 44107588303](https://github.com/FlareZ123/obfs/actions/runs/44107588303), SHA `e09d1fc45c90cae0ae65f5bd0558a1028f07fcf9`: all focused Node/strict JSDoc and Ubuntu real Chromium/CSP steps passed. For unknown computed property keys on proven JSON namespaces, the guard now chooses a safe source-observer refusal, even when a runtime key would select a harmless method.

Primary files: `test/json-parse-function-source-observer.test.js`, `src/ast.js`, focused `.github/workflows/manual-wasm-i32.yml` and `jsconfig.wasm-i32.json`. All guards are conservative and finite; proving a native symbol's identity in the presence of arbitrary reassignment, getters, custom realms, proxies and opaque host modules remains outside this evidence.

## Impact and limits

This closes one identified compiler admission hole. It may lead to whole-file refusal when the API receives an unknown value, which reduces obfuscation yield; this is intentional until a proof of source unobservability exists. It does not increase resistance to malicious runtime instrumentation or protect an adversary-controlled JS/Wasm runtime. It adds no measured runtime overhead to output, since only the compile-time eligibility decision changes.

The evidence does not justify claiming complete coverage of JavaScript-to-string coercion, of all native Web APIs, or of arbitrary aliasing.
