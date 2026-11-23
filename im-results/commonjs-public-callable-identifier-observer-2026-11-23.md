# Externally observed CommonJS callable exposes local identifier mangling (23 November 2026)

**Agent 38. Intermediate correctness red witness.** Experimental branch `agent38/private-yield-observer-matrix-20261123`, exact test SHA `6325c543f6ddb86a351f2f831eefa2b1b2e5b8f2`, focused Ubuntu/Windows run [45125976316](https://github.com/FlareZ123/obfs/actions/runs/45125976316) (both focused test jobs **red**). This is not a strong-obfuscation or release claim.

## Native-versus-emitted witness

For one CommonJS file, `identifiers:true`, `strings:false`, and default property mangling, consider:

```js
'use strict';
function inspect(){return 17;}
const reference='function inspect(){return 17;}';
function privateRead(){const privateOwner={secretField:17};return privateOwner.secretField;}
const observed=inspect===reference;
module.exports={observed,privateRead,value:privateRead()};
```

A CommonJS consumer can call `Function.prototype.toString.call(module.exports.privateRead)`. The native function source retains `privateOwner`; the compiler output replaces it with a generated name `_v5776989ce388`. Both calls return **17**. This changes observable source text, violating exact semantics even when the original program has no internal source-observation syntax. The test uses the external callable's `Function#toString` from the observing realm, so the mismatch comes from published output, not only an internal call.

At the pinned source:
- `observesFunctionSource(ast)` and `observesDistributedSource(ast)` both return `false` for the exported-function fixture.
- `identifiers:true` produces `bindings:3`, `objects:0`, `properties:0`, and **native source mismatch**; `identifiers:false` yields native parity and zero mangled bindings.
- The same one-file fixture **without exporting** `privateRead`, instead exporting only its primitive return value, preserves native behavior and renames one local private object field (`objects:1,properties:1`) and two lexical bindings, demonstrating nonzero private transformation yield.
- An unreferenced `inspect`, `typeof inspect`, `inspect===reference`, and `inspect!==reference` each preserve the nonzero safe field yield. Intrinsically source-observing `inspect==reference` and `String(inspect)===reference` conservatively decline all transforms (0/0/0).
- The 8 fixture forms × both identifier settings (16 evaluations) produced exactly **one** mismatched case, that exported callable with `identifiers:true`, identically on Ubuntu and Windows Node 22.

Reproduction: `test/agent38-private-yield-observer-matrix.test.js` at the exact branch SHA. The machine-readable `PRIVATE_YIELD_OBSERVER_MATRIX` output records every row and both expected/actual exported-source strings. The test deliberately fails after printing all rows. The existing `test/commonjs-public-callable-source.test.js` uses `identifiers:false` and therefore does not exercise this interaction. No universal inventory of source-observation escapes follows from these cases.

## Engineering disposition

**Red correctness witness, canonical source-observer intake requested.** Preserve the external observer oracle; add a focused production regression that refuses lexical renames inside source-visible exports, while retaining one genuinely private function/record as a positive-yield control. Account for aliasing, property publication, returned closures, reexports and opaque loaders before asserting a selective proof. A blanket file-wide no-transform rule might restore parity for these fixtures but would unnecessarily remove the proven local positive yield. A partial export detector needs conservative refusal for unproved callables.

Agent 3 owns the canonical source-observer/decoder integration intake; Agent 10 owns full-suite red/green disposition. This branch is a finite falsifier for their intake, without another competing compiler patch/PR. The finding is independent of the earlier 54-failure full mainline gate at `3d8e5e7...`; those failures should not be attributed to this witness without individual reproduction. The overall objective remains RELEASE-BLOCKED.
