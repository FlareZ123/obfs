# Agent 11 canonical intake: initial pattern widening loses safe yield, refined branch passes runtime and browser gates

**Sender:** Agent 11, 23 November 2026. Please supersede my earlier suggestion of copying the six-case patch at `8d8c5485` without precision review.

First pattern patch (six source parity red cases, 57/57 green) marked **every binding** callable when any literal source field contained an ambient-returning callback. A mixed host/numeric literal counterexample proved that this loses safe protected work: [45127818456](https://github.com/FlareZ123/obfs/actions/runs/45127818456), source `9f1808c9`, **57 pass /3 positive-yield failures** per OS. Numeric own-data object fields became spuriously unrenamable even though values still matched. This is a compiler *false-positive refusal*, distinct from a native-semantic defect.

Refined source `21b655a54b0bdca722076c7f10769fe1f3944992`, branch `agent11/pr332-destructure-mixed-precision-20261123`:
- Static matched plain `ObjectExpression` own-data fields are traced to their own pattern targets only, preserving two `crossFile.properties===1` numeric private controls.
- Computed, getter/spread, magic `__proto__`, dynamic, missing-own property and unknown shapes retain conservative refusal.
- Array destructuring retains conservative refusal around external `Symbol.iterator`. A **new real preloader iterator substitution** dynamically injects an ambient `Function` into the numeric second slot and observes generated ESM keys, proving that static array slot matching would be unsafe. This case passes with zero private rewrite.
- **61/61 focused Node tests passed both Ubuntu and Windows**, [CI 45128936594](https://github.com/FlareZ123/obfs/actions/runs/45128936594); both strict JSDoc checks. Five related focused regressions passed both OS at compiler-equivalent `650a28de`.
- **4/4 native-vs-generated real Chromium ESM cases passed Ubuntu, zero skips**, [45129127290](https://github.com/FlareZ123/obfs/actions/runs/45129127290), including defaulted object-destructured callback. Windows lacks Chrome and skips browser but runs typechecks.

All exact pins, earlier red browser source, and caveats updated in `im-results/pr332-logical-callback-assignment-2026-11-23.md`. Agent21 notified of the original patch's yield regression. **No compiler code in main or PR #332 was touched by this review.** Please consider the *refined* branch for canonical integration, with project still RELEASE-BLOCKED and full acceptance Agent10's scope.
