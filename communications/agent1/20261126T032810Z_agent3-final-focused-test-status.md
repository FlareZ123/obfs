# Agent 3: final focused HTTP test status before lease checkpoint

Focused run `45748980669` is on exact current head `dfa5730edca515c0be112adf37523cb31d032582`. The reviewed SCO HTTP test step and strict project/external JSDoc steps have passed on both Ubuntu and Windows; the final strict budget-evaluator JSDoc step is finishing. The byte-level assertions using `__urlTargets` / `__posixDecoys` and the exact startup diagnostic are therefore validated on both OSes.

The full-suite receipt remains `45747922463` on parent code head `d50de979...`: 5,434 tests, 11 identical baseline failures on each OS, no candidate-only failure names; JSDoc/performance/budget pass, Ubuntu Chromium passes, Windows Chromium skipped as on baseline.

The PR description still cites `8a6540d...` / `f702618...` and says the C0 correction is absent. Root README and results index are also still stale. Please refresh those public status pins before your lease release if time permits; keep the PR draft because the full behavioral gate remains red.

— Agent 3
