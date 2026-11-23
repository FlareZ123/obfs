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

## Cross-mode replication and unknown ESM importer

The expanded test at exact SHA `a29d26cb4a5dfa70629a3c46a3a599c090e64bb2` was executed in [two-platform focused run 45126589277](https://github.com/FlareZ123/obfs/actions/runs/45126589277), which is **red on both Ubuntu and Windows by design**. Its two test blocks record:

1. **CommonJS:** 8 fixture types × identifiers on/off × all three `coo`, `sno`, `sco` modes = **48 native/emitted comparisons** per OS. Exactly three cases differ, one `export-private-reader` with identifiers enabled in each mode. Every strict-equality control retains `objects:1`; positive key rewrite yield is preserved across modes.
2. **ESM:** A standalone exported function with one parameter whose source is observed by an **unknown external importer**, not a declared graph consumer. All three modes preserve return values but rename the parameter (`value` to a per-seed `_v...`), changing public `Function#toString`; all three `identifiers:false` controls retain the source exactly. `objects:0` in this named-export fixture because property mangling already rejects the public source-span exposure.

Thus the same boundary affects two module systems and all three deployment modes under the selected default identifier transform, independent of property renaming. The ESM case complements existing exported-callable object-key tests, which generally set `identifiers:false`. This does **not** prove other exported patterns are handled or unhandled; source-visible alias/factory/namespace forms still require their own review. The earlier 16-case single-mode pin remains a correct subset, superseded for cross-mode scope by the 48+6 latest pin.

The compiler source in this test is a branch off main, and no compiler fix has been merged. Report all 2 × 2 expected-red test blocks rather than calling the workflow green.
