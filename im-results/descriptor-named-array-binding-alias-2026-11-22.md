# Named array carriers of decoder descriptor entries (intermediate, 22 November 2026)

**Agent:** 1  
**Branch:** `agent1/descriptor-array-binding-alias-20261122`, stacked on `agent1/descriptor-array-entry-alias-20261122` and the unmerged draft decoder scanner of PR #293.  
**Status:** verified red-first native/emitted divergence; candidate fix pending full validation. Primary strong-security release decision remains **BLOCKED**.

## Counterexample

A direct array literal can be stored in a variable before its descriptor entry is destructured:

```js
const descriptors={ref:{}};
const refs=[descriptors.ref];
const alias=refs;
const [entry]=alias;
entry.get=function(){return String.prototype};
const box=Object.create(null,descriptors);
box.ref.charCodeAt=()=>0;
```

The `refs` array contains the original descriptor entry. A bound `entry` therefore holds the same object unless the array iteration has been changed. With the ordinary native iterator, the getter installed later returns `String.prototype`. Mutating `charCodeAt` then changes eager decoder behavior if the compiler fails to notice this source-visible path. The previous direct `const [entry]=[descriptors.ref]` proof saw only an immediately adjacent `ArrayExpression`, and ignored `const [entry]=refs`.

## Frozen red-first experiment

The test-only source `46d6b5f39d251ccbe953c7e6a52a1cba05c62d30` adds `test/decoder-object-create-named-array-alias.test.js`. Its 18 cases combine COO/SNO/SCO, three carrier expressions (direct named array, a further named alias, and assignment to an existing binding) and either String-sensitive or benign Number getter. Each checks original and transformed **separate Node process** stdout/status/stderr, followed by actual generated target literal counts.

[Full run 45058298655](https://github.com/FlareZ123/obfs/actions/runs/45058298655) at that exact test-only source reported **nine String-sensitive native/emitted stdout mismatches on Ubuntu** and nine passing Number controls. Ubuntu behavioral summary: 4,531 tests, 4,521 passes, nine failures, one skip. Windows results must be recorded separately after completion.

## Candidate alias-graph closure

Compiler SHA `12c8a09fa431fe55239c32bb76b7f8c3b2bd7ae8` performs a second traversal *after* `descriptorBindings` has been collected. For array-pattern bindings initialized from a source-visible identifier, a query-local visited set traverses that identifier's finite binding alternatives through other identifiers to any `ArrayExpression` source. A directly visible member read in the matching array element registers the output pattern's identifier as a possible `descriptorMemberReadAliases` target. The existing proven sensitive-getter guards then examine it before the dependent target's eager string encoding.

The visited set prevents cycles and repeated aliases from indefinitely expanding. Because the analysis takes a union over source-visible binding alternatives, it is conservative when reassignment or custom iterators alter actual values. It does not inspect arbitrary dynamic iterable sources, transparent helpers or unknown external functions. It therefore does not prove general JavaScript points-to soundness or external-runtime integrity.

Post-fix full two-platform source-pinned [run 45058616456](https://github.com/FlareZ123/obfs/actions/runs/45058616456) is underway. Green results and positive encoding counts must be verified before proposing integration. Neither this compiler correctness change nor its synthetic fixtures show stronger adversarial resistance or universal compliance with the 2.5× protected-runtime budget.
