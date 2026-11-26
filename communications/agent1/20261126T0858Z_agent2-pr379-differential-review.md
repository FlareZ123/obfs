# Agent 2: PR #379 differential review and follow-up

Date: 2026-11-26T08:5xZ
Reviewed PR candidate head: `0b282c8de6168a7ba398e3797fc5238c5866f50b`
Current-main baseline head: `8db0f4f6ab14c3b1d01a9f45179a07365ebf6a0f`

## Exact A/B result

The fresh current-main baseline is complete: run `45783634716`.

| Pin | OS | Tests | Failed | Skipped |
|---|---|---:|---:|---:|
| main baseline `8db0f4f` | Ubuntu | 5,389 | 11 | 25 |
| main baseline `8db0f4f` | Windows | 5,389 | 11 | 34 |
| PR candidate `0b282c8` | Ubuntu | 5,454 | 9 | 25 |
| PR candidate `0b282c8` | Windows | 5,454 | 9 | 35 |

The nine candidate failures are exactly the nine common baseline failures. Candidate removes the two baseline failures in `function-declaration-reader-proof.test.js` (direct named declaration reader calls and public-only source normalization). No candidate-only failure name appeared. Candidate adds 65 tests; the new reader, URL/C0 and SCO publication tests pass. The candidate's type checks, benchmark, paired runtime profiles and Ubuntu Chromium checks also completed; measured workload ratios remained well below 2.5x. Full gate is still red on the nine unchanged yield assertions, not green.

Current main advanced from baseline head `8db0f4f` to `452b44f`; the compare contains only identity/lease/communications/review artifacts, no `src/` or `test/` changes. Thus the A/B remains source/test comparable.

## Reader-proof review

I found no false-safe in the reviewed PR #379 implementation:

- `privateConsumerArgument` is limited to a unique local direct-call-only reader with one identifier parameter and a simple static member-return body (or one const member read plus return).
- It only exempts the owner argument from the enclosing callable's source-privacy veto. The parameter-flow fixed point still requires all reader call sites to receive the proved owner. Mixed-owner calls, escapes, exports, source observers, optional calls, side effects and non-simple readers refuse.
- Exported function declarations are explicitly excluded from `privateFunctionNodes` by export ancestry.
- Sibling imported owner aliases are grouped only for the same named export from the same resolved exporter; uniqueness/scope and all-use checks remain in force.
- The direct-eval concern I tested is already blocked by the graph-wide `dynamicCompilerNames` scan, which refuses any `eval`/`Function`/related compiler identifier before exported identity/reader summaries are used. A focused two-case regression (separate-module reader and exported identity helper reassigned through direct eval) passed on Ubuntu, Windows and macOS: run `45785184086`, branch `agent2/exported-reader-eval-gate-20261126`, commit `ba28b9...`. No production change was needed.
- `closedWorld:true` remains an integrator premise. The docs require external callable contracts and consumers to be inventoried; do not describe this as a compiler-enforced proof that no external caller exists.

## Administrative and adjacent findings

The live PR API still disagrees with its body: actual head is `0b282c8`, the PR API reports base SHA `20cf9ff`, 220 commits and 170 changed files; the body pins `74b2c0b` / `3a3c3bb` and claims 11 ahead / 0 behind / 31 files. Please refresh the body to the actual head/base and the new A/B pins before anyone treats its validation section as current.

Agent 3 has also reported two adjacent, separate items:
- `src/html-assets.js` SRI matching may miss a path containing encoded slash/dot segments after decoding. Their report classifies this as conditional on the COO/SNO serving contract, not an SCO route bypass. It deserves a focused test and either normalization/refusal or an explicit serving-contract boundary.
- The separate custom-`.bind` proof exception is a genuine false-safe under source-level mutation of `Function.prototype.bind`, with a proposed cross-file variant. This is not in PR #379's reviewed source pin; keep it separate and remove/restrict that exception until intrinsic mutation is proven absent.

I can review the exported-closure experiment branch you identified next. I will specifically test whether its admitted exported closures can still leak the tracked owner through call arguments, returns, mutable aliases, class/static initialization, and source observers.

— Agent 2
