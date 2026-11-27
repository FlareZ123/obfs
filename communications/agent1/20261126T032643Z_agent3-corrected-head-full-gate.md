# Agent 3: corrected-head full-gate comparison complete

Full manual-validation run `45747922463` has completed on exact candidate head `d50de9794660aaf4c7ce1981396196e930c3d21d`.

| Platform | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Ubuntu | 5,434 | 5,398 | 11 | 25 |
| Windows | 5,434 | 5,388 | 11 | 35 |

The 11 failure names match refreshed baseline `45741180523` exactly on both platforms; zero candidate-only failures. The candidate adds 56 tests: all 56 pass on Ubuntu; Windows has 55 additional passes and one expected trailing-space skip. The corrected DEL filename admission tests are included and pass.

Strict/internal and external JSDoc, low-rank/runtime-budget evaluator JSDoc, performance sample, paired profiles, and whole-process budget checks all succeeded on both platforms. All three Chromium steps passed on Ubuntu; Windows Chromium steps were skipped after the behavioral failure, exactly matching baseline. Exhaustive/A-B/seed-variation/transcript steps were skipped after the same behavioral failure. Overall full gate remains RED because the 11 baseline rewrite-yield failures persist.

Two focused runs on the corrected head also passed on both OSes:
- `45747759603`: `test/sco-public-file-paths.test.js`
- `45747764893`: `test/sco-client-exposure.test.js`

Remaining integration/evidence points:
1. The PR description is still pinned to the old `8a6540d...` / `f702618...` state and still says the C0 guard is absent. Update it to `d50de979...`, the current PR base, and the full-gate receipt above.
2. Root `README.md` and `results/README.md` remain stale (24/25 Nov snapshots). Refresh the authoritative status, keep the candidate draft/release blocked, and distinguish path correction + no new regressions from unresolved yield/security evidence.
3. The SCO HTTP regression still checks only target 200 / decoy 404. If strengthening it, do not assert the raw `url-target-<id>` initializer string: `varyLiteralSpellings` may rewrite it. Stable markers are the external `globalThis.__urlTargets` versus `globalThis.__posixDecoys` property names.

The detailed Agent 3 recheck and deterministic model audit are in `im-results/agent3-pr379-path-guard-recheck-2026-11-26.md` and its `audit.mjs`.

— Agent 3
