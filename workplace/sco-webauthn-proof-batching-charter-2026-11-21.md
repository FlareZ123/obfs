# Preregistered SCO WebAuthn 128-operation proof batching pilot (2026-11-21)

**Agent 10. Status:** candidate security-performance evaluation; release still BLOCKED.

## Motivation and narrow claim

Source-pinned [server-only proof CPU study](../im-results/sco-webauthn-proof-cpu-budget-2026-11-21.md) found verification per 500-round JS operation uses 111.46x (Linux) or 95.26x (Windows) its original CPU, strictly exceeding the protected-code 2.5x budget. The same study analytically suggested that one signature per 128 original operations *might* amortize that server-side component below 2.5x.

This pilot tests a **single proof for a whole 128-element batch**. Unlike a post hoc verifier interval, the protected proof must commit to all 128 arguments in the exact order before any private method runs. The trusted SCO server must reject a copied-cookie-only batch, a signed batch with one changed element, reused signed proof, forged signature and revoked session. The hostile allowed-origin runtime may still generate and forward fresh proof online, and that should **succeed** under the existing threat model. The batch output must preserve the 128 native values in order.

## Precommitted server-CPU screen

Create a separate deterministic Node script using the same `nativeKernel` and `verifySignedProof` from the existing CPU probe. Its protected arm runs **exactly the same** 500-round Int32 work as native, but invokes one legitimate ES256 signature verification per `B` consecutive operations rather than one per operation. Test fixed batch widths `B=32, B=128` to distinguish the expected strict negative and potential positive respectively.

Each A/B sample times **32 contiguous repeats of the original 4,000-call batch** = 128,000 native operations, alternating order for seven samples. CPU source is Node `process.cpuUsage`, one-process warmup, with pre-signed records outside timed region. No benchmark threshold changes after inspecting results. If B=128 still exceeds 2.5x on either OS, this candidate is vetoed on server-CPU alone. If under, label only a **component feasibility pass**, because browser signing, challenge issuance, JSON serialization, session policy, network and cross-principal contention are excluded. The B=32 contrast is an intentionally difficult negative control, not a requirement to fail for statistical correctness.

Validate native and protected checksum parity, raw seven paired samples and JSDoc on Ubuntu and Windows from a manually dispatched existing workflow. Explicitly preserve failed runs. The benchmark tests *cryptographic verification frequency*, independent of whether a production batch protocol is valid.

## Precommitted full-browser security contract

Extend existing real-Chromium `test/sco-webauthn-origin-boundary-browser.js` with a `proofBatch` server-resident method taking exactly one array of **128 safe integers**, calling the same deterministic `(Number(v)*17+29)>>>0` original computation for each element. The trusted `/proof-challenge` binds the exact array values and order to its one-use nonce and session; the `authorizeOperation` callback compares each element before verifying the WebAuthn ES256/RP/UV assertion and invoking the method.

Verify six named controls: legitimate authorized browser batch 128 correct outputs; copied cookie without assertion 403; a proof signed for one batch rejected when one element changes; signed batch order-swapping rejected; once-consumed signed batch replay rejected; fresh valid allowed-origin proof forwarded through copied-origin raw client succeeds 200. Additionally require explicit session revocation to block an unused proof, and assert no private method source is served.

The browser experiment is **semantics and security**, not a timed 2.5x end-to-end budget. Any measured virtual-authenticator wall time must be labeled a single observation and no hardware user presence implied.

## Interpretation

Only a validated exact-operation-batch commitment and **component-level** CPU under 2.5x can justify continued study. A prototype that merely verifies a signature without an exact batch commitment fails, regardless of performance. A genuine full SCO user session with repeated batches, authentication, network, protected execution and hostile-client relay must be measured independently before a release claim.

Rationale/prior work:
- `workplace/sco-authorized-relay-stopline-2026-11-19.md`
- `im-results/sco-webauthn-per-operation-boundary-2026-11-21.md`
- `im-results/sco-webauthn-proof-cpu-budget-2026-11-21.md`
