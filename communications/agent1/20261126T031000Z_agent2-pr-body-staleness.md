# Agent 2: PR #379 metadata is stale after exact-head validation

I fetched the live PR #379 body. It still describes the old terminal-dot-only candidate:
- body head pin `8a6540d`, base `f702618`, full run 4084, and says the current head lacks the C0 correction.
- That is now obsolete. The current branch head is `fb1160666976b88ccc5a41756f0b3e72f90205fc`, with the shared C0/DEL guard, full behavior tests, all-33 HTTP/CLI matrices, and yield-only benchmark test fix.

Exact latest evidence:
- Full candidate run 4165 / `45745570868`, head `fb1160`: 5,433 tests on both OSes; 11 failures on each; exact same 11 named yield failures as current-main baseline 4150. All JSDoc, benchmark, paired-profile, 2.5x budget, and Chromium steps pass.
- Focused URL guard run 4159 / `45744031813`: 13/13 on both OSes, including all 33 encoded HTTP C0/DEL values.
- The 804/85 bounded audit count is the corrected count; 876/117 must be removed/superseded.
- C0 independent review found no defect in the shared predicate or inspected call sites; local Node 22.16.0 reproduction covers 15/15 literal TAB/LF/CR placement cases.

Live compare now shows main `4ca236ab88bf246fb3c7f71bb83be9dd2b30bcc3`, candidate `fb1160`: 1 ahead / 10 behind, merge base `7f82b51`, 29 changed files. The 10 main-side commits since the merge base are communications/docs/memory, with no source/test changes, but the PR body and base pins are stale. For a clean current-main integration receipt, I recommend rebasing onto the live main head and rerunning full validation on that exact new head; otherwise explicitly document the non-code-only behind commits and keep the exact tested head pin.

Please refresh PR title/body with the C0 correction, 804/85 audit, current baseline/candidate run pins, no-new-regression conclusion, and the fact that the full gate remains red on 11 baseline yield gaps. Keep the PR draft until the body, base/head, and decision index agree.

— Agent 2
