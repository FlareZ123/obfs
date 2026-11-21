# SCO browser-session WebAuthn-batched wall-time comparison charter (2026-11-21)

**Agent 10. Pre-registered wall-clock study, separate from the strict 2.5x protected compute CPU rule.**

## Question and fixed experiment

The prior same-source [signed 128-value batch experiment](../im-results/sco-webauthn-proof-batching-2026-11-21.md) paired real Chromium batch-security canaries with a *different* synthetic 500-round per-op server-CPU benchmark. The positive server verifier ratio for that heavier work must never be claimed for the real browser 128-value arithmetic batch. This study measures the observed end-to-end **wall latency** of exactly the same arithmetic mapping under a browser-native baseline and under the fully authorized proof-gated remote SCO batch.

Fix the original computation to the exact browser fixture primitive `(Number(v)*17+29)>>>0` for each of 128 safe integers `v=index-64`. Repeat each batch **32 times** sequentially, producing the same 4,096 primitive outputs in the same order:

- A baseline: one real Chromium page executes a local JavaScript `map` for each batch, with no remote RPC or authenticator.
- B protected: the same origin page requests a fresh `/proof-challenge` for that exact batch; signs with real `navigator.credentials.get` using the existing CDP virtual CTAP2 authenticator requiring UV; POSTs the signed proof, valid HttpOnly cookie and exact 128-value batch to the real `createScoHandler` server-private `proofBatch`, then reads and verifies every returned result. Every protected batch consumes one nonce. All 32 signed assertions must pass; no private source is sent to the browser.
- Both A and B are measured **within one `page.evaluate` call each**, using browser `performance.now()` elapsed time for the complete repeat loop. This avoids counting 32 Puppeteer/CDP round trips as part of the signed pathway.
- Warm up each arm once, then collect **five paired alternating A/B wall samples**, with protected batch measured second/first alternately. Browser registration and initial WebAuthn login are outside timing; per-operation challenge issuance, signing, network and SCO verification remain inside the protected arm. The browser user-verification ceremony uses a virtual device and does not model physical user presence.
- Report raw baseline and protected wall milliseconds, median protected/native ratio, per-batch private RPC count, and byte-exact outputs. Never interpret network-including wall time as the project's **compute-only** 2.5x ratio.

## Falsifiers and decision

If any of 32 batches fails credential authentication, proof freshness, private method parity, or ordered result equality, the candidate has a correctness/security integration failure. If all pass, record the measured wall ratio regardless of size. An observed wall ratio above 2.5 marks significant end-to-end **latency** degradation for this exact tiny arithmetic workload, and is an important user-experience negative; it is not a mathematical proof of the CPU budget failing. If the wall ratio is ≤2.5, this would be a provisional wall-only finding and still not a CPU compliance pass.

Do not alter batch size, number of loops, or original arithmetic after seeing results. Source-pin the existing manual-only `webauthn_boundary_only=true` Chromium/JSDoc workflow, preserve all raw measurements, and publish only intermediate evidence.

Limitations: CPU attribution across Chromium + Node is outside this wall-only study; browser signing/network and server CPU have different trust boundaries and transport costs, and any model of concurrent authenticator capacity, real hardware user presence, cross-account service isolation or online relay is separately needed. The primary release gate remains BLOCKED.
