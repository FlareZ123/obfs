# Derived Array values and mapping callbacks that reveal function source

**Agent 2, 2026-11-17 UTC.** Intermediate semantics-preserving source-observation research. These changes add compile-time refusal evidence with no injected runtime logic. There is no novel attacker-hardness measurement in this report.

## Mechanism

A function can become an array element through a **derived** Array operation even when the array being joined is distinct from the original array:
- `const copy=[protectedSum].slice(); copy.join(',')`
- `Array.from([protectedSum]).join(',')`
- `[protectedSum].concat([]).join(',')`
- `[0].map(()=>protectedSum).join(',')`
- `Array.from([0],()=>protectedSum).join(',')`

The default `Array#join` conversion can expose `protectedSum`'s exact native source spelling. A body-rewriting native affine transform may therefore change externally visible output. Source-carrier analysis limited to Array literals and simple aliases fails when the function reference is forwarded into a newly allocated Array or produced by a callback.

The `src/ast.js` source-observer helper now tracks known Array-derived operations (`slice`, `concat`, `filter`, `map`, `flat`, `flatMap`, `toReversed`, `toSorted`, `toSpliced`, `with`, `Array.from`, and `Array.of`) when an input or explicitly inserted value is known to carry a function. Its small callback-return proof recognizes an inline arrow/function body directly returning a known function or function-bearing Array, including a direct `return` statement. Purely primitive arrays remain eligible for the selected affine rewrite.

## Reproducible local trials

- **Red** [workflow 43988470402](https://github.com/FlareZ123/obfs/actions/runs/43988470402), `e09a5727136fd144c446cba6d1f54c2f25313b0f`, failed 10 of 89 tests on Ubuntu and Windows because the compiler accepted ten derived-array function source observers. The protected-work positive on a derived primitive-only Array passed.
- **Initial fix** `src/ast.js` `5581c479a4debc921060cc333830e511f4658351`, [green workflow 43988604188](https://github.com/FlareZ123/obfs/actions/runs/43988604188), passed 89/89 selected source tests on both OS and strict JSDoc.
- **Callback red** [workflow 43988920288](https://github.com/FlareZ123/obfs/actions/runs/43988920288), `5371eb34a85c39824b697716ef3e8b5d77b3479b`, failed four extra cases with a function returned by `map`, `flatMap`, or `Array.from` callback on a primitive-only source.
- **Callback fix** `src/ast.js` `950e129a7ecf665d2cabdb2f914eb2caa710d9d5`, [green workflow 43989062844](https://github.com/FlareZ123/obfs/actions/runs/43989062844) passed 94/94 selected source tests on both OS and strict JSDoc. Test file: `test/array-derived-source-observation.test.js`.

## Cross-module trials

`test/cross-file-array-source-observation.test.js` checks the same issue when the *producer* exports the new function-bearing Array while a separately imported ESM consumer joins it. Six variants cover `slice`, `concat`, `Array.from`, `filter`, `map`, and `toReversed`, with an unrelated primitive-only export positive. [Red 43988692830](https://github.com/FlareZ123/obfs/actions/runs/43988692830), `c6177130807fd0693fe3399cc9b109866757f531`, failed all six new cases. The initial fix `src/cross-properties.js` `0ac932e06a78a5563d8e737e6e446bd103ee77d8` added detection of a function-bearing CallExpression, but the fixed-point candidate filter initially omitted those CallExpression values, so [run 43988815895](https://github.com/FlareZ123/obfs/actions/runs/43988815895) remained red. Follow-up `2a0a3c86c85141d94727565536fa573207431a33` corrected the filter, and [green 43988989151](https://github.com/FlareZ123/obfs/actions/runs/43988989151) passed 30/30 ESM cases on both OS and strict JSDoc.

The next red trial [43989122226](https://github.com/FlareZ123/obfs/actions/runs/43989122226) tested inline mapping callbacks in an ESM producer. Three of 34 tests failed because arrays derived from primitive input with callbacks returning `protectedSum` were not recognized. `src/cross-properties.js` commit `815039e235806cf17f088ab084b66d16e68b9b44` adds direct callback-return proof to the producer's Array-carrier fixed point. [After-fix targeted workflow 43989262095](https://github.com/FlareZ123/obfs/actions/runs/43989262095) and [full integration workflow 43989268020](https://github.com/FlareZ123/obfs/actions/runs/43989268020) were dispatched at this report's original writing; their verdicts must be checked and added before a final green assertion.

## Boundaries

This is a source-observation refusal guard, with possible reductions in protected-work yield. The approximations do not prove arbitrary higher-order callbacks, nonlocal mutation, dynamic module resolution, property getter effects, reflective use of foreign Array constructors, or opaque library calls. A passed differential suite of 94 local / 34 ESM examples must not be extrapolated into universal ECMAScript equivalence.

The runtime 2.5x constraint remains a separate, measured performance obligation for each selected obfuscation configuration. Compile-time source proof performs no extra operations in the emitted protected code. Earlier results: [direct Array coercion](array-function-source-sort-coercion-2026-11-16.md), [mutation](array-mutator-source-observation-2026-11-17.md), [cross-file provenance](cross-file-array-source-observer-2026-11-17.md).
