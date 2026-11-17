# Array insertion mutators and transitive ESM mutation as function-source carriers

**Agent 2, 2026-11-17 UTC.** Intermediate compiler-compatibility evidence. This record concerns native-output parity and positive protected-work yield, rather than measured security against a real attacker.

## Behavior contract

An array initially empty or containing only primitives can gain a function value through `push`, `unshift`, `splice`, `fill`, assignment to a numeric index, or equivalent operations through a local alias. Later `join`, `sort`, or detached generic `Array.prototype` methods may convert those elements into their exact function source text. Rewriting a selected function's body while ignoring the new function element can change native output.

Example:

```javascript
function protectedSum(input) { return (input | 0) + 12; }
const values = [];
const alias = values;
alias.push(protectedSum);
module.exports = values.join(',');
```

The source observer lives after the mutation. A local declaration-only proof that `values=[]` carries no function is unsound for this example.

The same issue crosses ESM boundaries: a producer can `export const values=[];values.push(protectedSum)`, while an importer later performs `values.join(',')` without spelling the function's name. Reexport relays compound the issue.

## Pinned evidence and fixes

- **Local red:** [workflow 43987565427](https://github.com/FlareZ123/obfs/actions/runs/43987565427), SHA `0ff9ecc5fedcbb009ba832eebb67f49b41da6405`, failed **7 newly added source-observer tests out of 78** on Ubuntu and Windows. Each failed because the compiler incorrectly accepted selected function rewriting. A previously supported numeric-index assignment-through-alias case and the primitive-only mutation positive still passed.
- **Local repair:** `src/ast.js` fixed-point function-carrier propagation now observes calls to `push`, `unshift`, `splice`, and `fill` when inserted arguments contain a tracked function. It tracks mutated owner aliases and known function-array spreads through the existing carrier analysis. Commit `6c324c53ef7ed951fd283bca7bcb184f95ea3484`. [After-fix workflow 43987875640](https://github.com/FlareZ123/obfs/actions/runs/43987875640) passed **78/78 runtime test cases per OS**, although its overall job result was red due to an unrelated TypeScript narrowing error in the concurrently changing ESM reexport helper. That type error was subsequently fixed in `db4c8283dc0d5091a4ba8eda6948e348167a2096`.
- **Cross-file red:** [workflow 43988009048](https://github.com/FlareZ123/obfs/actions/runs/43988009048) at `adc8e021a4d0aefac22f0a4765c4a5160ed0de75` failed **6 new ESM mutation-observer tests out of 23**, identically on both OS. Cases include push/splice/indexed assignment, mutation through a local alias, spread of a function array, and one reexport relay. Existing direct, default, and transitive unmutated function arrays and a primitive-only mutation positive passed.
- **Cross-file repair:** `src/cross-properties.js` `collectImportedFunctionArrays` now includes a fixed-point may-carry propagation for direct mutation calls and indexed assignments through candidate local aliases. Commit `15ecc54e02ae0b5b3f1ac9c848933ee5d8d8c2f3`.

## Validation and limitations

The local tests are in `test/array-mutator-source-observation.test.js`, which also requires a primitive-only mutated array to retain the explicit native affine protected function transform. The ESM cases and primitive positive reside in `test/cross-file-array-source-observation.test.js`. Workflows `manual-array-source-coercion.yml` and `manual-crossfile-array-source.yml` run both Node 22 Windows and Ubuntu plus JSDoc checks.

**After-fix cross-file validation:** [workflow 43988087788](https://github.com/FlareZ123/obfs/actions/runs/43988087788), pinned at `15ecc54e02ae0b5b3f1ac9c848933ee5d8d8c2f3`, passed **23/23 tests per OS** and JSDoc, including all six previously failing mutation cases and primitive-only positives. Full integration [43988128091](https://github.com/FlareZ123/obfs/actions/runs/43988128091) at the same SHA was subsequently dispatched; its result must be checked separately before claiming the complete suite is green. The analysis tracks specific static mutation syntaxes and direct named import graphs. It does not prove that all arbitrary helper invocations, borrowed mutators, host getters, multi-realm intrinsics, dynamic numeric keys, and reflective array operations are safe. A conservative refusal may persist after an element is overwritten or deleted because the current proof is may-contain, which reduces transformation yield rather than native fidelity.

Related reports: [detached Array sources](detached-array-source-coercion-2026-11-17.md), [nested/generic carriers](nested-arraylike-source-observation-2026-11-17.md), [cross-file provenance](cross-file-array-source-observer-2026-11-17.md).
