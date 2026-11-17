# Detached native Array method calls as function-source observers

**Agent 2, 2026-11-17.** Intermediate semantics-preservation discovery and guarded implementation. The observed incorrect *acceptance* of an unsafe source-changing obfuscation, rather than attacker-cost improvement, is the issue addressed.

## Vulnerability in a guarded native transform

The source-observation analysis recognized direct `array.sort()` and `array.toSorted()` when the array was proved to contain function values. It missed cases that invoke the same native algorithm through a detached method reference:

```javascript
function protectedSum(input) { return (input | 0) + 12; }
const values = [protectedSum, 'function protectedSum(input){m'];
const sorter = Array.prototype.sort;
const normalizedOrder = sorter.call(values)
  .map(value => typeof value === 'function' ? 'fn' : 'str');
```

The default sort comparator uses `ToString` on array elements, including the target function. A body-transforming obfuscator can change its source spelling, move it across the fixed string sentinel, and therefore change `normalizedOrder` despite preserving every direct numeric call result. Existing source-observation proof handled the direct method `.sort()` but did not connect `sorter` back to `Array.prototype.sort`. The same problem affected `.apply`, `Reflect.apply`, and `Array.prototype.toSorted` aliases; `Array.prototype.join` could directly return the function source as a joined string.

## Reproducible red and green

`test/array-detached-source-coercion.test.js` now pins seven negative Array sorting variants: direct native `.call`, aliased `.call`, forwarded-alias `.apply`, direct and alias `Reflect.apply`, direct native `toSorted.call`, aliased `toSorted.apply`. A separate negative tests native `Array.prototype.join` under `.call`. The positive controls require an explicitly selected polyvariant arithmetic function to remain transformable when the detached sort operates on a proven primitive-only array.

- **Red** [manual source-coercion run 43985369531](https://github.com/FlareZ123/obfs/actions/runs/43985369531), `f53900487082dfab17eacfdfa218eb81dcefb4a3`, had **8 failures out of 61 tests** on both Windows and Ubuntu Node 22: all eight new negative cases were wrongly accepted by the obfuscator. All 53 previously covered cases passed.
- **Repair:** `src/ast.js` now tracks exact native Array.prototype source-coercing method extraction in a fixed-point Set, including simple identifiers and forwarding assignments. A `CallExpression` with `.call`, `.apply`, or `.bind` on that proven method and a receiver carrying a tracked function is classified as a source observer; `Reflect.apply` with the detached method and a function-carrying receiver is also observed. `.bind` conservatively counts as observable because subsequent use may escape static analysis. Implementation `1b4b3c90930700dcb7b787b5b7c6523b5f5775be`.
- **Green** [manual source-coercion run 43985593483](https://github.com/FlareZ123/obfs/actions/runs/43985593483), exact `1b4b3c90930700dcb7b787b5b7c6523b5f5775be`, passed **61/61 targeted source-observer tests** on Linux and Windows, plus strict JSDoc typecheck.

## Scope and remaining gaps

The alias proof is syntactic: only `Array.prototype.<method>` and identifiers/assignments derived from it are tracked. It does **not** establish universal detection for dynamic property keys, alternate realm intrinsics, object-property containers, `Function.prototype.call.call(method,receiver)`, or arbitrary imported wrappers. Preserving those behaviors in a closed-world program can require additional evidence.

The implementation is a compile-time refusal guard, and does not inject per-call runtime checks. Thus its direct runtime overhead is zero for emitted programs; losing eligibility to obfuscate source-observed functions is a deliberate compatibility tradeoff. This finding does not measure dynamic attacker extraction or independent static reconstruction cost.

Source semantics are grounded in [ECMA-262 Indexed Collections, Array.prototype.sort and CompareArrayElements](https://tc39.es/ecma262/multipage/indexed-collections.html). The existing [earlier direct-array source repair](array-function-source-sort-coercion-2026-11-16.md) covers the simpler `array.sort()` syntax.
