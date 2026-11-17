# Function-source observation through Set/Map iteration (17 November 2026)

**Status:** scoped semantic compatibility hardening. This is intermediate
engineering evidence, not general JS equivalence, deobfuscation resistance,
attacker-cost advantage, or universal 2.5× performance proof.

## Mechanism and counterexample

A protected function's native source text is program-observable when the
function is inserted into a `Set` or `Map`, iterated into an array, and
stringified by `Array#join`. This can happen in one CommonJS file or
through immutable ESM exports consumed by another module. Source-changing
polyvariant transformations alter `Function#toString`; an obfuscator that
admits these cases changes observable behavior.

Representative source shape:

```js
function protectedSum(input) { return (input + 17) | 0; }
const bag = new Set([protectedSum]);
const text = [...bag].join(',');
```

The original `text` includes the exact native function declaration.
A rewritten source body has different `text` even if numeric results match.

## Reproducible red/green evidence

| Boundary | Pre-fix control | Follow-up |
|---|---|---|
| Same-file COO, Set/Map construction and mutation | [run 44004715171](https://github.com/FlareZ123/obfs/actions/runs/44004715171) at `cd151bc4`: 5 failing negative tests / 100 total on **both** Ubuntu and Windows | [run 44004866133](https://github.com/FlareZ123/obfs/actions/runs/44004866133) at `c02025f5`: entire targeted workflow green on both platforms, including strict JSDoc |
| Cross-ESM imported collection and aliases | [run 44005008905](https://github.com/FlareZ123/obfs/actions/runs/44005008905) at `d76418d4`: 4 failing imported Set/Map negative controls on **both** operating systems | [run 44005125631](https://github.com/FlareZ123/obfs/actions/runs/44005125631) at `07debf58`: targeted workflow green on both platforms, including strict JSDoc |
| Default exports, renamed reexports and Map key iterators | Additional independent tests added at `ed8c3c57` | [run 44005259403](https://github.com/FlareZ123/obfs/actions/runs/44005259403) at `ed8c3c57`: targeted workflow green on both platforms |

The red-run tests verify that the reference program exposes
`function protectedSum(input)` or, for ESM, that the compiler improperly
admits a selected source-changing transform. The current tests then require
conservative refusal when source spelling can be observed. Both suites include
a **primitive-only positive control** requiring the selected protected function
to remain eligible for a genuine polyvariant transformation.

Exact source and reproduction:

- `test/iterable-function-source.test.js`: five local red controls and one
  primitive-positive case.
- `test/cross-file-iterable-source.test.js`: imported direct, mutated,
  aliased, default/reexported Set and Map carriers, with a positive control.
- `src/ast.js` at [`c02025f5`](https://github.com/FlareZ123/obfs/commit/c02025f514099cdd8651a04fa2058b1ddf712595):
  detect constructors, iterator methods and mutator-propagated function-bearing
  containers in the source-observation fixed point.
- `src/cross-properties.js` at [`07debf58`](https://github.com/FlareZ123/obfs/commit/07debf58f6a91f3a14acab60d949f5f02fb0da1a):
  propagate function-bearing Set/Map exports and mutators into the
  imported-function-container proof.
- `.github/workflows/manual-array-source-coercion.yml` runs the tests on
  Ubuntu and Windows Node 22 with `npm run typecheck`.

## Limits and project implications

The guard favors **preserving native semantics** over transformation yield
when a function's exact source could be reflected. It tracks a bounded set
of static constructors, aliases, iterator method names, and mutations.
Arbitrary custom iterables, accessor-produced values, unknown callbacks,
higher-order collection factories, dynamic imports, and undocumented runtime
source observers remain outside this proof. Neither test suite proves
universal observational equivalence.

No independent attacker was defeated: a hostile COO/SNO recipient still has
all emitted code, and an SCO client with legitimate service access may still
relay authorized server responses. The newly admitted **primitive** paths
retain the same compiler transform and runtime overhead as before; the
additional compiler analysis and broader application cold/hot performance
have not been measured here, so no 2.5× claim is made. The full integration
gate must be pinned separately from these targeted results.
