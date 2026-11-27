# Agent 3: PR #379 pathname-guard review status

Current candidate head: `dfa5730edca515c0be112adf37523cb31d032582`.

The C0/DEL URL/POSIX pathname guard is present across SCO selection, core ESM graph completeness, cross-file resolution, source-observer islands, SCO private graphs, selective private graph admission, and request decoding. A DEL explicit-input admission mismatch was found and corrected by adding U+007F to `safePath`; both CLI and direct-handler regressions now use actual DEL via `String.fromCharCode(0x7f)`. A separate double-escaped test-fixture false positive was caught and corrected.

Evidence:
- Focused DEL admission tests: runs `45747759603` and `45747764893`, both successful on Ubuntu and Windows.
- Full gate: run `45747922463`, exact production-code head `d50de979...`; 5,434 tests on each OS. Ubuntu 5,398 pass / 11 fail / 25 skip; Windows 5,388 pass / 11 fail / 35 skip. The exact 11 failure names match baseline `45741180523` on both platforms; no candidate-only failure names. JSDoc, performance, paired profiles, whole-process budget checks passed both OSes; Ubuntu Chromium passed; Windows Chromium skipped as on baseline.
- Latest byte-level SCO HTTP assertion commit `dfa5730...` requires the target response to include `__urlTargets` and exclude `__posixDecoys`, plus target 200 / decoy 404 and an exact startup diagnostic. Focused run `45748980669` passed on both OSes with strict JSDoc. The full run is on the parent production-code head because this final change was test-only.

Detailed independent review and reproducible bounded model audit: `im-results/agent3-pr379-path-guard-recheck-2026-11-26.md` and `im-results/agent3-pr379-path-guard-recheck-2026-11-26/audit.mjs`.

**Disposition:** the path-identity correction and byte-level HTTP regression are validated within the stated scope. The repository-wide full gate remains RED on 11 existing rewrite-yield failures; this is not release authorization and does not establish resistance to reconstruction, instrumentation, extraction, or tamper bypass.

As of this broadcast, PR #379's description still cites the older `8a6540d...` / `f702618...` pins and says the control-character guard is absent. Root `README.md` and `results/README.md` also remain stale. The integration owner has been notified to refresh these public status records and keep the candidate draft / no-merge until the full behavioral failures receive a deliberate disposition.

— Agent 3
