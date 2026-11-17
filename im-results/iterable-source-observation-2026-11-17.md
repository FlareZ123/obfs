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

## Callback and iterator-binding extensions

The collection iterator proof now follows functions through local
`for (const value of iterable)` bindings and direct
`collection.forEach(value => ...)` parameters, including exported
collections. This matters because a function may enter a new
array/Set/Map via a callback after the container construction.

- [Pinned red run 44005688880](https://github.com/FlareZ123/obfs/actions/runs/44005688880)
  at `e0753a6f`: 5 negative source-observer tests failed out of 116
  tests on **each** OS, while 111 passed.
- [Pinned follow-up 44005831271](https://github.com/FlareZ123/obfs/actions/runs/44005831271)
  at `81326e8c`: **116/116 functional tests passed** per OS; overall
  workflow still red due unrelated `src/decoder-safe-reads.js(35,31)`
  TS2532 JSDoc error, which was addressed separately at `0c8d94ce`.
- [Pinned full targeted run 44006145477](https://github.com/FlareZ123/obfs/actions/runs/44006145477)
  at `0c8d94ce`: entire 116-case Ubuntu/Windows behavior and JSDoc
  gate **green**.
- [Pinned red run 44006283421](https://github.com/FlareZ123/obfs/actions/runs/44006283421)
  at `6e9e5da0`: 4 misses when `Map.forEach` passes a function-valued
  **key** as its second callback argument and `Set.forEach` repeats
  the function value in its second argument. 117/121 tests passed
  per OS.
- [Pinned green run 44006412478](https://github.com/FlareZ123/obfs/actions/runs/44006412478)
  at `ad7f75e6`: entire expanded Ubuntu/Windows suite green,
  including strict JSDoc.
- The next regression expands to the **third callback argument**,
  which can reference the source collection itself; its separately
  pinned result must not be inferred from the above.

Sources: [MDN Map iteration semantics](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map)
documents that keys and values can be arbitrary objects/functions and
that `Map` iteration produces pairs; `Map#forEach` exposes value,
key and map arguments. [MDN Map values](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/values)
defines its values iterator. The compiler's tracking is conservative:
`forEach` second arguments of all known function-bearing collections
are treated as potentially functions, which can refuse extra safe
rewrites of ordinary array-index callbacks. This precision limitation
has not been independently measured.

## Collection callback owner and modern Set algebra

Extended the callback proof to its third argument, which is the original
collection. Without that dataflow, `Map#forEach((value,key,owner) => ...)`
can iterate `owner.values()` and stringify a function that was never
named in the callback body. Identical behavior arises for `Set`.

- [Red 44006539785](https://github.com/FlareZ123/obfs/actions/runs/44006539785)
  at `2d9704da`: 4 missed owner-argument source observers; 121/125
  tests pass per OS.
- [Green 44006669728](https://github.com/FlareZ123/obfs/actions/runs/44006669728)
  at `d5aeefe2`: 125/125 and JSDoc green on Ubuntu and Windows.

Modern `Set` composition also carries object references through
`union`, `intersection`, `difference`, and
`symmetricDifference`. See
[MDN union](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/union)
and [MDN symmetric difference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/symmetricDifference).
The compiler's new source-observer rule follows receiver values for
all four operations, and additional argument elements for union and
symmetric difference. The proof is deliberately conservative when
membership is statically unknown.

- [Red 44006799003](https://github.com/FlareZ123/obfs/actions/runs/44006799003)
  at `49166851`: 5 same-file function-bearing Set composition
  observations were missed, alongside an **unproved** ESM primitive-only
  positive-control expectation. 130/136 tests passed per OS.
- The ESM primitive-only composition positive was removed from the
  candidate evidence because the existing conservative cross-file
  source-observer gate already declines that graph. An ordinary imported
  primitive-only `Set` remains in the suite as a verified positive.
- [Green 44006989359](https://github.com/FlareZ123/obfs/actions/runs/44006989359)
  at `6e49b1ac`: revised targeted suite and strict JSDoc green on
  both operating systems.

These tests assert semantic refusal of source-changing transformations.
They do not demonstrate deobfuscation hardness, protected execution under
an attacker-controlled runtime, or any workload-independent runtime bound.

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
