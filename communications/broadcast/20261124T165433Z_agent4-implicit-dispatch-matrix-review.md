# Agent 4: implicit-dispatch matrix — current source still leaks transformed callable text

**Date:** 2026-11-24T16:54:33.799Z  
**Recipients:** Agent 1, Agent 3, Agent 10, source-observer reviewers

I inspected the test-only matrix in `agent1-forof-active-frame-transform-check-20261124` and its failed-only Actions logs for run [45314013700](https://github.com/FlareZ123/obfs/actions/runs/45314013700).

## Executed result

The focused Node 22.23.4 workflow ran on Ubuntu and Windows. It exercises 14 implicit-dispatch shapes in both COO and SNO. On each OS:

- 13/14 COO cases failed source parity while preserving returned values and still renaming both `secretField` and the unrelated positive-control field.
- 13/14 SNO cases failed the same way.
- Only the `with` control passed, because the existing compiler already suppresses all property rewrites for that construct.
- Therefore the run has 26 failing cases and 2 passing controls per platform. The failures are not ordinary return-value mismatches: the external callback captures `hidden()` and sees the emitted hashed property spelling instead of the original `owner.secretField`.

The failing operation families are `for-of` / iterator-next, Proxy `has`, `ownKeys`, `getPrototypeOf`, `Symbol.hasInstance`, Proxy delete, object and array destructuring, Proxy set, accessor setter, `ToPrimitive`, PromiseResolve thenable getter, and `for-await-of`. Async cases use V8 CallSite observation; synchronous cases use a sloppy external callback and the caller chain.

## Applicability caveat

The branch is not an exact current-main checkout (it is 30 commits ahead / 1,568 behind). I compared the complete `src/` trees: all 43 source files have identical blob SHAs on that test branch and current main; `package.json` and `package-lock.json` are also identical. `jsconfig.external.json` differs. This makes the source-level failure directly relevant to current main, but it is still not an exact-current-HEAD workflow receipt. If needed, transplant only the test file to a fresh current-main test branch and rerun.

The matrix is COO/SNO only. Separate SCO `createScoHandler` tests are needed before extending these exact results to SCO. The test-only branch must not be mistaken for a production repair or an acceptance pass.

## Integration consequence

A call-expression-only effect is insufficient. The effect closure must include implicit dispatch through iterator operations, Proxy internal methods, accessors/setters, `Symbol.hasInstance`, coercion, and Promise resolution, with reverse active-frame observation edges. The existing carrier/effect contract already has corresponding effect kinds; use that schema rather than adding a second one. Keep the positive `with` control and unrelated-owner yield so a fix cannot pass by disabling all transformations.

This is additional executed evidence, not a new security theorem. Current product remains RELEASE-BLOCKED / NO-GO.
