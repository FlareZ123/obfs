# Native btoa is a function-source observer in all three obfuscation modes

**Agent:** 2. **Date:** 22 November 2026. **Status:** Concrete pre-fix semantic mismatch and narrow corrected regression, confirmed on Node.js 22 Ubuntu and Windows. **Security classification:** Intermediate correctness evidence, not a stronger hostile-runtime security result.

## Contract and counterexample

Web-compatible `btoa(value)` converts its input to a string before Base64 encoding. Passing a JavaScript function exposes the exact `Function#toString` source spelling through the resulting encoded string. No explicit `.toString()` method call appears in the user's program.

A representative native input is:

```js
'use strict';
function inspect(){return 'original-function-source-ABC123';}
module.exports=btoa(inspect);
```

The experimental obfuscator, with `strings:true`, rewrote that literal to an indexed runtime decoder expression while preserving the function's ordinary return value. The produced Base64 output consequently encoded the *rewritten function source*. The native and emitted results differed, violating exact observable behavior. A detached `const binaryEncode=btoa` alias and a nested direct call reproduced the same mismatch.

The source-observer scanner in `src/ast.js` already tracks standard native coercers and their aliases, including `String`, `RegExp`, and URI encoders. Its `builtinCoercers` set lacked `btoa`. The conservative correction adds one native coercer entry to the existing observer logic. For unknown or function-valued inputs, ordinary function-source transformations are refused; for an obviously primitive string input, string encoding remains allowed.

## Reproduction and red/green source pins

- [**Pre-fix focused two-OS run 45018621385**](https://github.com/FlareZ123/obfs/actions/runs/45018621385) at `0710f586771e61cc2bde45bb231fe9ffacc768e5`: **failed on Ubuntu and Windows**. All nine (3 call shapes × 3 modes) exact-function-source differential cases failed; the separately scoped private-literal positive-yield control passed.
- [**First corrected two-OS run 45018755083**](https://github.com/FlareZ123/obfs/actions/runs/45018755083) at `db4ab747f3fcd37f35fcd5fe30b0f1a57ff4cb91`: **passed** on Ubuntu and Windows, including both strict project and external JSDoc steps, for all original cases.
- [**Extended corrected two-OS run 45018854839**](https://github.com/FlareZ123/obfs/actions/runs/45018854839) at `70ae240c5f8f600514375a73ba2e35a3545cd755`: **passed** on Ubuntu and Windows, including both strict JSDoc gates. Added `globalThis.btoa`, `.call`, `.apply`, captured global member, and a primitive-string `btoa('safe-ordinary-string...')` positive-yield case. Full per-mode regression now has 24 source-observation differential tests and six positive-yield controls.

The test is `test/btoa-function-source-observer.test.js`. Each case uses a fresh Node `vm` context with native `btoa` injection. It executes both the unmodified and compiler-emitted CommonJS and compares the visible exported Base64 string. The three modes are exercised through `obfuscateFiles`, with `identifiers:false`, `properties:false` to isolate the literal rewrite. Seeds differ across mode and case to avoid accidental frozen-output assumptions.

## Interpretation

This is a compatibility repair to the already-implemented source observer, bounded to listed native `btoa` syntax/alias forms under Node 22. It does not establish comprehensive runtime source transparency, a defense against external observer injection, or stronger obfuscation. The full mainline Node/browser integration and all optional transforms require separate frozen-source validation. It adds no runtime instructions to the ordinary positive-yield fixture; it declines potentially observable rewrites in the scoped bad cases. No universal 2.5× time claim follows.

The existing primary release assessment remains **RELEASE-BLOCKED**.
