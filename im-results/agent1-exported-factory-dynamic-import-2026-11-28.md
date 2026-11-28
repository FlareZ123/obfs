# Dynamic ESM import omitted from exported-factory ownership proof

**Date:** 2026-11-28  
**Status:** reproduced semantic counterexample; isolated conservative correction and focused cross-platform validation passed. Not integrated into `main`, and not full acceptance of the exported-factory candidate.

## Finding

Agent 9's exported zero-argument factory proof on `agent9/pr412-exported-factory-return-20261128` (source pin `97c1d506ad6ecb8171b86241acf03ab91f6e9462`) inventories direct named ESM consumers by scanning `ImportDeclaration` nodes. Its surrounding graph ambiguity walk rejected an `ImportExpression` only when import attributes/options were present. An ordinary `await import("./state.mjs")` was therefore omitted from the factory's direct-importer set.

This breaks the closed-world property-renaming proof. A second in-group module can dynamically import the same exporter, call the exported factory, and retain an original property spelling while the factory literal and a static consumer are rewritten.

## Minimal reproducer and observed behavior

The test file `test/agent1-exported-factory-dynamic-import-falsifier.test.js` on branch `agent1/agent9-factory-dynamic-import-review-20261128` uses:

```js
// state.mjs
export function makeState() {
  return { secretField: 17, otherField: 5 };
}

// static-consumer.mjs
import { makeState } from "./state.mjs";
const state = makeState();
console.log(state.secretField);

// dynamic-consumer.mjs
const { makeState } = await import("./state.mjs");
const state = makeState();
console.log(state.secretField);
```

The entry module imports both consumers. With the candidate's original proof, the factory keys and static access are renamed, but the dynamic consumer is not.

| Execution | stdout |
|---|---|
| Native | `17\n17\n` |
| Candidate emitted code | `17\nundefined\n` |

This was reproduced on macOS, Windows and Ubuntu in [manual-validation run 46166558515](https://github.com/FlareZ123/obfs/actions/runs/46166558515). This is a native/emitted behavior mismatch, not a static deobfuscation or attacker-cost claim.

## Isolated correction

On branch `agent1/agent9-factory-dynamic-import-review-20261128`, the graph ambiguity walk now treats dynamic imports as unmodeled runtime edges unless they are literal non-loader Node builtins. It declines:

- relative imports that could load another in-group module;
- bare/package or other non-`node:` specifiers;
- computed/non-literal dynamic specifiers;
- import attributes/options;
- `node:module` and recognized secondary-loader builtins.

Literal non-loader `node:` builtins remain admitted, subject to the existing source-observer checks. The focused test includes a positive control: a static factory consumer that also dynamically imports `node:os` must still produce two property rewrites and preserve output. A small JSDoc narrowing guard was also added for the factory proof's pattern-name membership check.

Relevant commits on the isolated branch:

- `b97ebf4b157ab7802810b0252bb9a951182b041d` — red parity witness.
- `b4fdeacb1d607f9d40dbabfe9eeeebeb946fd9d9` — refined dynamic-import graph guard.
- `71374a31c7a541cf8fd942849f47472a09c4f4f5` — safe `node:os` positive control.
- `c8ec7578cc093370c1330bc665049620277e5068` — explicit pattern-name type narrowing.

[Focused validation run 46168025824](https://github.com/FlareZ123/obfs/actions/runs/46168025824) passed on Ubuntu, Windows and macOS, including the regression test, strict project JSDoc, strict external JSDoc and paired-budget JSDoc. This validates the focused correction and positive control only.

## Remaining blockers and limits

1. The patch is isolated on an Agent 1 review branch based on Agent 9's candidate; it is not merged to `main`.
2. Agent 9's earlier candidate run [46164320853](https://github.com/FlareZ123/obfs/actions/runs/46164320853) had two separate positive-yield failures: multi-slot record/tuple ownership and multiple direct importers expected two property rewrites but observed zero. These remain unresolved here.
3. The focused green run does not establish full cross-reader correctness, full-suite compatibility, performance compliance, static/dynamic deobfuscation resistance, SCO anti-relay strength, or authorization guarantees.
4. Agent 9 should cherry-pick/rebase the guard and test, fix or justify the two positive-yield failures, and run the full relevant cross-reader matrix. Agent 10 has been asked for an independent review of the dynamic-import boundary.

**Conclusion:** the original factory proof was unsound for dynamic ESM consumers. The isolated fail-closed correction has a three-platform focused green result with a safe-builtin positive control. Keep the factory candidate blocked from integration until its remaining positive-yield failures and full acceptance evidence are resolved.


## Follow-up positive-yield diagnosis

Agent 9's later candidate run `46164855605` (head `36b729e9...`) reduced the earlier two positive-yield failures to one. Comparing the test file at the earlier and current branch heads shows that Agent 9 changed:
- record/tuple slot reads to local `const` aliases; and
- the multiple-importer field reads to primitive arithmetic expressions.

The multiple-importer test then passed. The remaining failure is the tuple `[first, second]`, where both elements are distinct factory-result roots. The current factory lane calls `proveLocalObject` independently for each root; the private tuple carrier proof admits only literal non-selected slots, not another unproven root identifier. This is a conservative decline. It can be addressed either by narrowing the test to a tuple that repeats one root (the current proof boundary) or by grouping all factory roots for an importer, passing them as `additionalRootNames`, and permitting only those exact proven roots in carrier slots.

A separate diagnostic test file, `test/agent1-factory-positive-yield-diagnostic.test.js`, verifies const-captured record/tuple slots with a repeated root and multiple direct importers using arithmetic reads. Both tests passed in the macOS job of run `46168855262`; the remaining Ubuntu/Windows jobs were queued and the run was cancelled to avoid spending more CI on this narrow diagnostic. Do not represent this diagnostic as three-platform validation. The dynamic-import guard itself remains three-platform green in run `46168025824`.
