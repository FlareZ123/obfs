# Fresh indexed array literal primitive proof restores safe source-observer coverage

**Status:** intermediate compiler proof and reproducible differential corpus, 17 November 2026. **Author:** Agent 10.

## Restricted theorem and specification basis

For a fresh ECMAScript ArrayLiteral with **no spread elements**, an immediately read computed index that is a finite nonnegative safe-integer literal, in bounds, and selects a **present initialized element**, always returns the element's evaluated value. The array cannot escape before the immediate property read. The selected own data property is created by the ArrayLiteral evaluation algorithm, rather than depending on any inherited property getter.

The [ECMAScript 2026 ArrayAccumulation normative algorithm](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-runtime-semantics-arrayaccumulation) uses `CreateDataPropertyOrThrow` for each ordinary element. The specification explicitly explains that this bypasses hostile inherited setters. A selected element whose evaluated value is independently proved primitive cannot stringify a function's original source merely because the surrounding `+` or `String(...)` implicitly coerces it.

This does **not** extend to missing array slots, spreads whose length may shift indices, locally aliased arrays that could have been mutated, or elements of unproven type. They retain conservative source-observation refusal.

## Compiler change

[Commit `823e0669`](https://github.com/FlareZ123/obfs/commit/823e0669eb251e6c9dc319fb42fc208854f17bc8) extends `src/ast.js::isDefinitelyPrimitive` with the restricted fresh-literal indexed-slot proof. This prevents a false `observesFunctionSource` result on expressions such as `['long-private-value', 'other-private-value'][0] + '!'`. The original runtime semantics remain unchanged.

A separate failed-operand gate in `src/strings.js` must still prevent rewriting source-spelled inline call targets, including `(['private-long-value'][0])()`, whose failed native invocation can disclose the original operand spelling through `TypeError.message`. The source-observer primitive proof does not waive that distinct obligation.

## Paired red and green evidence

- [Red run 43999548814](https://github.com/FlareZ123/obfs/actions/runs/43999548814), exact `361a635963ef0161206499f9883f4647a373370a`, reproduced a false source-observer refusal for the first fresh-index positive in both Ubuntu and Windows. The six intentionally unsafe syntactic negative controls and native prototype-hole witness passed.
- [Green run 43999656771](https://github.com/FlareZ123/obfs/actions/runs/43999656771), exact `823e0669eb251e6c9dc319fb42fc208854f17bc8`, passed fresh-index positives for strings, booleans and numbers, all hostile negatives, independent static-recovery tests and both strict JSDoc checks.
- [Seeded 128-case corpus](../test/inline-array-primitive-fuzz.test.js) exercised 64 deterministic expressions in both SNO and explicit `strings:true` COO. Every case checked the source observer, emitted encoded literal count, independent Acorn-based static reconstruction of the table, original/generated/reconstructed native VM output parity, and at least two recovered uses. [Run 44001615435](https://github.com/FlareZ123/obfs/actions/runs/44001615435), exact `46b1e188fee7355831b4af89353a93f2b3746b63`, passed the corpus and other attacker/decoder regressions with JSDoc on both systems.

## Interpretation

The improvement recovers transformation coverage for a precisely proven class of source-level coercions, with no dynamic execution of attacker-supplied code in the proof logic. The new positive also makes the independent public-XOR-table attacker succeed, so it **does not increase static confidentiality** against that attacker. Encoding can add runtime cost, and these correctness tests do **not** prove a universal 2.5× budget. The separate `Object.prototype`/Array-prototype mutation guard in `im-results/inherited-array-index-decoder-2026-11-17.md` remains necessary for string decoder correctness if older modules mutate the ambient realm.
