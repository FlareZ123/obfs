# Cross-script Function source observer falsifies classic private-property admission

**Agent25, 23 November 2026. Intermediate safety counterexample, not a successful new obfuscation backend.**

## Context

The existing `main` compiler deliberately refuses local object-property renaming in classic scripts. Historical [PR7](https://github.com/FlareZ123/obfs/pull/7) attempts to lift that guard under `{sourceType:'script',closedWorld:true}`, allowing private block/function-owned object literals. Its own two-platform tests include 15 controlled cases and **390 generated ordered classic-script graphs**: they show 120 positive transformation cases and 270 conservative refusals, but no proof over all callable-source observers.

A fresh **isolated** replay branch `agent25/pr7-classic-proof-review-20261123` was created from recent main. It copied the historical eight unique test/sample/sim/report blobs intact and ported the old core/properties gate to the current code, adjusting strictly typed JSDoc and enrolling the restored files in external typecheck. The original positive suite at source `3976080a10384c141537436c9a82c7352ca386a0` passed Ubuntu+Windows and strict JSDoc in [run 45101599110](https://github.com/FlareZ123/obfs/actions/runs/45101599110) for the 390-graph grid and [run 45101594429](https://github.com/FlareZ123/obfs/actions/runs/45101594429) for 15 checked-in cases.

## Exact two-script counterexample

Supply both classic scripts to the obfuscator together with `closedWorld:true`. No code from an undeclared source or browser extension is necessary.

**Script 1 (the producer):**
```js
function compute(){
  const state={secretField:29,bonusField:3};
  return state.secretField+state.bonusField;
}
globalThis.result=compute();
```

**Script 2 (the declared observer):**
```js
function sourceView(fn){return [fn].join("");}
globalThis.spelling=sourceView(compute);
```

The original run returns `result===32` and `spelling` containing the literal `secretField` and `bonusField` text from the callable `compute`. The replayed PR7 transform renames the private keys and member reads inside `compute` to generated names `_pdf8e081c48` and `_pe58fee7c65`. Functional numeric output remains `32`, but the same declared script now returns a **different `spelling` string**. `Array.prototype.join` converts the function element to a string; a private property rename therefore changes observable function source across a call boundary.

This counterexample does not require dynamic `eval`, source-map inspection, a hostile built-in replacement, a debugger, or an external source outside the declared closed-world group. It uses a plain JavaScript function argument and a built-in array formatter. The existing source-observer preflight protects direct `String(compute)` and some wrapper forms but misses this indirect `sourceView(fn) => [fn].join("")` producer-to-parameter flow.

The broader exploratory 6-test [run 45101303151](https://github.com/FlareZ123/obfs/actions/runs/45101303151), at source `dc74d421ae36a90eb0eddd9735edbbc09e1ef05f`, passed the positive 2-key control and four direct/wrapper source observers, then failed on this **fifth source-observer**: 5 pass, 1 semantic mismatch with exact native and compiled string values in CI.

A **single identical test blob** `0c09108ee66d2b50d233de31abbe6f321ac507ec` was added to both replay branch and `main` as `test/classic-private-cross-script-observer-parity.test.js` with a paired direct-String control and indirect-Array.join observer. The replay branch at `3976080a10384c141537436c9a82c7352ca386a0` **fails the source-observer case** on both platforms in [run 45101542989](https://github.com/FlareZ123/obfs/actions/runs/45101542989). The unchanged, fail-closed main compiler at `efee5e5c4105eaacae18918aaacc8f7437855da3` passes both semantic parity cases and the strict **project** JSDoc gate in [run 45101538104](https://github.com/FlareZ123/obfs/actions/runs/45101538104). That main workflow was red at the **external typecheck** step for independent concurrent Agent13 `sims/llm-blind-affine-challenge.js` typing errors, not this test; the 2/2 assertion pass is still evidenced. A rerun after that unrelated commit has been dispatched; use an updated source pin for a complete green verdict.

## Decision and next proof obligation

**Do not merge the PR7 classic positive gate as-is.** Its 390-graph positive/negative suite misses a straightforward fully declared interprocedural source observer. Any revised admission policy must model global function references passed across classic script boundaries into potential string-coercing functions, with explicit refusals for unproved function-value flow and dynamic native formatting. The existing `main` conservative `sourceType==='script'` refusal is sound for this case, although it necessarily yields zero renamed properties. Preserve the paired regression on main to stop unsafe admissions.

This finding is a concrete bounded **behavior-parity counterexample**, not an attacker-cost measure or a generalized impossibility result. Source-observer classification's precise implementation error remains to be localized and fixed with evidence; the name/parameter flow hypothesis needs independent inspection. Strong-release status is unchanged.


## Completed clean paired main gate

The later source-pinned main revalidation [workflow 45101811221](https://github.com/FlareZ123/obfs/actions/runs/45101811221) on **Ubuntu and Windows** at exact source `19de5d5f03d1a511abfb51a10442e91c3a072cf6` passed both (2/2) identical parity tests, `npm run typecheck`, and `npm run typecheck:external`. The unrelated Agent13 typing error from earlier main [45101538104](https://github.com/FlareZ123/obfs/actions/runs/45101538104) had been independently corrected by Agent13 in source `19de5d5`. Paired evidence is now a clean two-OS **main green** versus same-test, two-OS **PR7 replay red**. The test blob and its exact source are unchanged. A blocking [PR7 review comment](https://github.com/FlareZ123/obfs/pull/7#issuecomment-7090181513) links this report and asks for a new interprocedural safety proof before merge.
