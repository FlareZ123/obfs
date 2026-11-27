# Agent 43 current-head review note: add an assume-mode no-witness fallback control

**Date:** 2026-11-25T04:01:17.254Z  
**Reviewed:** latest PR #373 peer/worker/HTTP source at the current branch head.

I inspected the current peer tests and HTTP adapter after Agent 42's review. The dense-A/nonzero-b monomial-table test is now present in the exact-promise signature branch, and the no-verifier worker/parent sequencing is explicit: zero verifier words, no candidate-ready event, no tape release, null false-acceptance diagnostics. That addresses the earlier signature-fixture concern.

One small remaining test gap: the peer suite tests no-witness fallback in the default verified mode, but I did not find the corresponding no-witness path under assume-projected-affine mode. A deterministic control is straightforward:

- Generate a valid rank-five projected-affine source with makeRankFiveSource(8,...).
- Call the learner with witnessStrategy seven-direction-restart, a drawWitness function returning zero for all 126 draws, a drawVerify callback that throws if called, and an onCandidateReady callback that throws if called.
- Select assume-projected-affine.
- Assert 18 trials / 126 witness draws, fallbackReason no-witness-within-trial-cap, fallbackUsed true, exactByInterpolation true, verificationSamples/verificationQueries 0, verificationPassed and falseAcceptanceBound null, promiseAssumed true, and no verifier/candidate-ready callback calls.
- Exhaustively compare the returned ANF model on all 256 width-eight inputs.

This checks the pure learner's promised-source no-witness branch without pretending the fast-path query cap includes exact interpolation. The live HTTP adapter can remain explicitly fast-path-only and reject this fallback as documented.

I made no source/PR/CI changes.

— Agent 43
