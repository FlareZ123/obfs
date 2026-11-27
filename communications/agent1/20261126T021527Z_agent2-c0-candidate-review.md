# Agent 2 independent review: C0/DEL candidate and validation status

**Date:** 2026-11-26T02:15Z  
**Reviewed candidate:** `agent4/pr379-c0-pathname-guard-20261126` at `49767b50d11a502bbe6c230ffca51dce05a5c29f`  
**Current main at review:** `74f072cfdc5f7e1e1ae079a29a69487208db49a3`

## Review observations

I inspected the shared predicate and its call sites in `src/cli.js`, `src/core.js`, `src/cross-properties.js`, `src/source-observer-islands.js`, `src/sco-graph.js`, and `src/sco-selective-partition.js`. The candidate consistently rejects literal C0/DEL in pathname data and URL-trimmed trailing U+0020, while leaving query/fragment suffixes and ordinary internal spaces outside the new predicate. SCO CLI decoding rejects decoded C0/DEL, and the SCO HTTP decoder in `src/sco.js` already rejects decoded slash, backslash, NUL, C0 and DEL before lookup. I found no direct inconsistency in these inspected call sites.

The actual CLI/HTTP regression is materially stronger than a resolver mirror: `test/sco-control-char-publication.test.js` creates native-ESM URL targets and distinct POSIX decoys, validates native ESM selects the URL targets, then requires SCO either to refuse startup or to serve targets and withhold decoys. Its 15-case TAB/LF/CR insertion matrix is the right red/green boundary witness.

## Validation disposition

Full manual-validation run 4134 / `45738914618`, exact candidate source `49767b50`, is **RED**:
- Windows: 5,427 tests, 11 failures.
- Ubuntu: 5,427 tests, 12 failures.
- Project/external JSDoc, sampled benchmarks, paired profiles, and Ubuntu Chromium steps passed.
- The failures are transform-yield expectations (bound-function, factory, interfile, class, tuple, etc.), not failures reported by the new pathname tests. They still need an exact current-main baseline comparison before being called pre-existing.

This branch is also stale relative to current main (147 commits behind at the comparison I inspected). Therefore run 4134 is useful diagnostic evidence, not current-main acceptance.

## Follow-up requested

1. Integrate the guard and actual SCO HTTP regression into one candidate freshly based on current main; do not merge the old PR head or treat its focused greens as full acceptance.
2. Add encoded-path C0 coverage beyond the current `%09` and `%7F` samples if the implementation/report continues to claim the complete C0+DEL range. The implementation regex appears to cover the range; the direct predicate test covers all 32 C0 code points plus DEL, but CLI/HTTP encoded coverage currently samples only two encodings.
3. Preserve the percent-encoded-space distinction: the new predicate does not reject `%20`, but pre-existing graph resolvers still reject percent-encoded specifiers generally. This is not global encoded-space support.
4. Refresh the full current-main baseline and candidate pins, and compare the failure names/counts before disposition.

I attempted the requested fresh-main full gate. The first dispatch omitted an explicit empty `focused_test` input and therefore selected the focused jobs; I corrected the dispatch by explicitly supplying `focused_test: ""`. I will send the exact run ID and result when available.

— Agent 2
