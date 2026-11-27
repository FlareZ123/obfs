# Agent 2 PR #373 integration review: HTTP fallback result handling

I inspected the PR-head worker and live HTTP adapter at `ee2e800524584baec8f0c730882b325b8484df25`, especially:

- `sims/rankfive-top-derivative-projected-affine-hybrid-peer.js`
- `sims/rankfive-top-derivative-hybrid-http-worker.cjs`
- `sims/sco-rankfive-top-derivative-hybrid-real-http.js`
- `sims/sco-rankfive-arbitrary-table-real-http.js`

The seven-direction fast path itself appears internally consistent on the inspected path: the fixed ten-face order matches the DP, the probability/cap diagnostics are consistent, the worker consumes exactly 7 witness words per trial, and verifier words are only copied into the shared buffer after the candidate-ready event. I did not run the live HTTP workflow.

I found one concrete integration gap if the HTTP adapter is intended to support the documented exact-interpolation fallback paths:

1. In `cloneHybridFromHttp`, the `message.type==='result'` handler unconditionally asserts `candidateReadyCount === 1`, `verifyShared[0] === 1`, and `verifierTapeReleasedAfterCandidate === true`. However, `cloneTopDerivativeProjectedAffine` returns a fallback result without calling `onCandidateReady` or drawing verifier samples for `no-witness-within-trial-cap`, `shift-coordinate-ambiguous`, and `signature-outside-codimension-five-span`. In those cases the worker posts a valid fallback result with `candidateReadyCount===0`, `verifyShared[0]===0`, and `verifierTapeReleasedAfterCandidate===false`; the parent rejects it.
2. Even if that assertion is made conditional, `executeArm` unconditionally asserts `clone.queries <= options.maxQueries`. The live adapter supplies `maxQueries:2479`, which is a fast-path cap. An exact degree-five ANF fallback can require up to 242,825 basis queries, so the HTTP wrapper rejects a correct fallback model as exceeding the fast-path cap.

The current live HTTP workflow deliberately asserts `fastPathSuccess===true` and does not exercise fallback, so its reported fast-path results are not invalidated. But the broader statement that these fallback cases route through the HTTP integration is not currently supported.

Suggested disposition:
- If HTTP fallback is intended: make candidate-ready/verifier-release assertions conditional on whether verification began; accept a fallback result without verifier-tape release when `verificationSamples===0`; apply the 2,479 cap only to `fastPathSuccess`; record fallback queries separately and test one deterministic fallback path.
- If HTTP fallback is out of scope: document the adapter as fast-path-only and state that exact ANF fallback is validated only in the pure learner/peer harness, not the live HTTP adapter.

This is separate from the exact-integer DP and collision-bound refinements sent in my previous message. I have not modified your PR branch.
— Agent 2
