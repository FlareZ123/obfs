# Native JSON function-source coercion: defensive admission control (2026-11-17)

**Classification:** intermediate semantic-correctness regression and finite guard. This is no obfuscation security claim.

## Source-observation mechanism

ECMA-262's [JSON.parse](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse) converts its first argument with `ToString(text)`. With a function-valued argument, conversion obtains the function's native source text. The resulting invalid JSON may produce a runtime `SyntaxError.message` containing a source excerpt. Renaming a function or rewriting its body can therefore change the observable string, even though the user code never calls `.toString()` explicitly. This matters for a one-to-one-preserving JavaScript obfuscator.

The later [JSON.rawJSON](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/rawJSON) API similarly accepts a JSON text string and is available in Node 22.16.0. A research-specific negative control for rawJSON has been queued, and a verified verdict should be added separately.

## Pinned red and green controls

- [Red run 44105608945](https://github.com/FlareZ123/obfs/actions/runs/44105608945), pinned SHA `0e3ba8dd92746a403e3756eb521002cb7a2e80bd`: original `observesFunctionSource` returned **false** for a direct `JSON.parse(protectedLabel)`. The native exact-source error text changed after a function rename. Both OS runners passed the primitive literal positive control; their test jobs each had exactly one failed JSON.parse observation assertion.
- New `src/ast.js` analysis tracks JSON namespace aliases, direct `JSON.parse`, detached methods, destructuring, `.call/.apply`, and `.bind` through monotone alias propagation. An unresolved or function-valued argument refuses rewriting; a proven primitive does not.
- [Green run 44105948998](https://github.com/FlareZ123/obfs/actions/runs/44105948998), pinned SHA `bf89da9d373feda0447ca03383d24b6688027d9d`, passed both Ubuntu/Windows differential and strict JSDoc stages, and Ubuntu's real Chromium/CSP stages. The 10-case JSON.parse source-coercion matrix checked original vs transformed COO and SNO runtime error messages; no mismatch was observed. The proven primitive positive control retained a nontrivial transform.

Primary files: `test/json-parse-function-source-observer.test.js`, `src/ast.js`, focused `.github/workflows/manual-wasm-i32.yml` and `jsconfig.wasm-i32.json`. All guards are conservative and finite; proving a native symbol's identity in the presence of arbitrary reassignment, getters, custom realms, proxies and opaque host modules remains outside this evidence.

## Impact and limits

This closes one identified compiler admission hole. It may lead to whole-file refusal when the API receives an unknown value, which reduces obfuscation yield; this is intentional until a proof of source unobservability exists. It does not increase resistance to malicious runtime instrumentation or protect an adversary-controlled JS/Wasm runtime. It adds no measured runtime overhead to output, since only the compile-time eligibility decision changes.

The evidence does not justify claiming complete coverage of JavaScript-to-string coercion, of all native Web APIs, or of arbitrary aliasing.
