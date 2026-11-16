# Implicit Array function-source coercion: pinned red and green compiler guard

**Agent 2. Date: 2026-11-16. Classification: intermediate source-compatibility result, not a security-hardness finding.**

## ECMAScript mechanism and compiler boundary

JavaScript's default `Array.prototype.sort` comparison converts compared elements to strings. `Array.prototype.toSorted` follows the same default comparison semantics. A function converts to its source text unless its conversion behavior is replaced. `Array.prototype.toString` and `Array.prototype.toLocaleString` also stringify array elements. Specifications: [ECMA-262 indexed collections](https://tc39.es/ecma262/multipage/indexed-collections.html) and [MDN Array#sort](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort).

An obfuscator that rewrites a function body changes its visible source spelling. This can affect not only directly returned strings, but also the ordering of arrays whose default comparator implicitly consumes the function's source text. Explicit `.toString()` scanning is insufficient.

One minimal distinguishable contract is:

```javascript
function protectedSum(input) {
  return (((((((((input | 0) + 17) - 8) + 213) - 55) + 64) - 2) + 34) - 10) | 0;
}
const list = [protectedSum, 'function protectedSum(input){m'];
module.exports = list.toSorted()
  .map(value => typeof value === 'function' ? 'fn' : 'str')
  .join(',');
```

The native program emits `str,fn`. A function body rewritten to begin with `{const...` can sort earlier than the `{m` sentinel and produce `fn,str`, changing observable semantics even when the protected arithmetic outputs remain equal.

## Evidence

- **Source-before-fix:** [full Linux/Windows run 43982026407](https://github.com/FlareZ123/obfs/actions/runs/43982026407), exact `5023c55034e8f4ffdf6336f8ab3b7e80622da44d`, failed the newly introduced local Array `sort` and ESM imported-function sort observer cases because the obfuscator **accepted** them rather than refusing. Both platforms reported `Missing expected exception` on source-observer tests. This pin had two overstrict new test assertions and an initially unsuitable primitive-only positive fixture; its overall failure count must not be interpreted as all compiler defects.
- **Source fix:** `src/ast.js` now uses `sourceCoercingArrayMethods` for `join`, `toString`, `toLocaleString`, `sort`, and `toSorted` when `containsFunction(receiver)` holds. This preserves the existing alias/fixed-point function-value proof and conservatively declines a source-changing transformation. Source patch `f4adee7b6b285988b2f77332e8ec3d1efa60f74e`. Adjusted independent regression assertions in `c9f80148ea27795d3aa08bafa62507ecc933573e`.
- **Focused after-fix:** [manual Array source coercion workflow 43982927483](https://github.com/FlareZ123/obfs/actions/runs/43982927483), exact `68d1bc6bc23001c1e616ce13281c01c9d0ae16f2`, passed **52/52 tests** on both Ubuntu and Windows Node 22, plus JSDoc typecheck. The tested selection includes `test/array-sort-function-source.test.js`, `test/source-coercion-array.test.js`, `test/source-coercion-alias.test.js`, `test/string-method-source-observation.test.js`, and `test/implicit-comparison-source.test.js`.
- The positive primitive-only array sort case still transforms the selected function (metric `polyvariantFunctions===1`) and preserves behavior. This prevents the regression from being hidden by a blanket "refuse all sorts" policy.
- **Whole-suite scope:** [full run 43982671638](https://github.com/FlareZ123/obfs/actions/runs/43982671638), at the earlier patch SHA before corrected new-test assertions, remained red because of test assertions and four unrelated existing regressions in property/ESM/strings. The initial shared [broadcast](../communications/broadcast/2026-11-16T2355Z_agent2_full-suite-existing-4fail-and-array-guard.md) enumerates the four; the [subsequent correction](../communications/broadcast/2026-11-16T2358Z_agent2_correction-normalizer-not-compiler.md) establishes that two reported output mismatches occur only **after the independent attacker-token normalizer**, while the compiler-generated programs matched native before that attack. Other failures concern positive obfuscation coverage and static-recovery fixture expectations. Focused green is not full integration success.

## Security, scope, performance

This is a semantic safety repair: a newly recognized observer now prevents rewriting function bodies when their exact spelling is implicitly observable in proved array containers, including a closed-world imported ESM binding case. It does not increase deobfuscation resistance, protected function yield for source-observed inputs, or enforce owner-host authorization. It is implemented in a compile-time AST analysis; its overhead is compile-time only, and no fresh representative whole-session benchmark is claimed. Existing performance tests in the full run have unrelated source revisions; they do not isolate this patch's cost.

Remaining possibilities include detached method aliases, `Array.prototype.sort.call(array)`, custom comparators, mutated built-in methods, unknown opaque containers, and interactions with source-reading host APIs. The guard's tracked receivers and fixed-point alias model are conservative, but do not establish universal ECMAScript observational equivalence. Test those specifically before claiming coverage.

**Decision:** retain the guard and pinned positive/negative tests as compatibility infrastructure. Independent attack cost on frozen app remains the dominant unresolved project objective.
