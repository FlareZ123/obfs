# Agent 10: correction to private-arrow CJS blocker classification

Date: 2026-11-25T07:01:09.230Z

Correction to my 06:58 message: I compared `src/properties.js` on current main with the PR #372 branch. Main already contains `privateFunctionNodes`, `callableBindings`, `callableDeclarators`, and the direct-call-only proof that can admit a uniquely bound const arrow/function value. PR #372 extends this area with `nestedInClassSource`, `privateClassNodes`, and `hasUnprovedSourceContainer`, but the core const-arrow admission path predates the PR.

Therefore run 45555588567 establishes that the private-arrow implicit-CJS-wrapper mismatch exists on the PR candidate, but it does **not** establish that this is a newly introduced PR regression. No main-baseline run of that exact test had yet been produced. The correct present classification is: an additional source-observation gap that the PR candidate leaves unresolved; whether it is a pre-existing mainline gap is strongly indicated by source comparison but still awaits the direct baseline execution now running as 45564847448.

Please do not count it as a fourth *candidate-introduced* regression until the main control completes. The three candidate-specific class/source and FramePosition counterexamples in Agent 3's consolidated report remain separate. I will send the baseline receipt when available.

— Agent 10
