# SCO 128-operation WebAuthn proof batch: bound arguments, online relay, and isolated CPU (2026-11-21)

**Agent 10. Classification:** preregistered, independently source-pinned intermediate architecture candidate with real Chromium and two-OS server-CPU checks. **Not a release or a complete 2.5x compliance finding.**  
**Precommitted contract:** [charter](../workplace/sco-webauthn-proof-batching-charter-2026-11-21.md).

## Motivation

Previous [per-operation proof CPU evidence](./sco-webauthn-proof-cpu-budget-2026-11-21.md) found server verification alone costs 95–111x the CPU of the small 500-round Int32 native operation, far exceeding 2.5x. The frozen additive model suggested a 128-operation group may amortize a single ES256 verifier below 2.5x at the **server-only** level.

The new experiment contains **two distinct and explicit** proofs of feasibility: an isolated verifier-frequency CPU screen on 500-round synthetic JS kernels, and a separately source-pinned real Chromium WebAuthn proof that cryptographically commits to every element of a 128-element original-result list before the genuine SCO handler executes the private batch. These test separate workload properties and cannot be algebraically combined into an unmeasured full-system ratio.

## Frozen server-only CPU benchmark

`sims/sco-webauthn-proof-batch-cpu.js` calls the same signed ES256 verifier from `sims/sco-webauthn-proof-cpu-budget.js`, with pre-generated legitimate P-256 signatures and exact clientData, RP SHA-256 and UP/UV checks. Both arms compute the same native `Math.imul` Int32 kernel for 500 rounds. Original arm performs no verification. Protected arm performs **one genuine signature verification per B consecutive operations**. B is fixed in the charter to 32 and 128.

Every A/B sample measures **128,000 original operations** across 32 repetitions of the fixed 4,000-call test batch, with seven alternating sample pairs. Node `process.cpuUsage` counts user+system CPU microseconds; every original/protected checksum matches, and the same JS execution loop is used in both arms. Chrome signing, nonce creation, RPC serialization, HTTP, cookie session authorization and host effects are deliberately excluded, so ratios are **server verifier component only**.

[Final Linux + Windows manual CI 44878034483](https://github.com/FlareZ123/obfs/actions/runs/44878034483), exact tested code head `3d963476ff6f5718cf6de8ed2cefbd42a020ea6f`, Node 22, strict external JSDoc and all paired parity checks passed. The raw seven paired microsecond timings are preserved in the source-pinned CI logs.

| Platform | Proof every B ops | Native CPU µs/op | Protected CPU µs/op | Ratio | Isolated 2.5x screen |
| --- | ---: | ---: | ---: | ---: | --- |
| Ubuntu | 32 | 0.6663 | 2.8860 | **4.3313x** | **Fails** |
| Ubuntu | 128 | 0.6652 | 1.2473 | **1.8750x** | Component passes |
| Windows | 32 | 0.7344 | 2.9297 | **3.9894x** | **Fails** |
| Windows | 128 | 0.6094 | 1.2188 | **2.0000x** | Component passes |

The 32-group pair is a valuable negative control: grouping is not sufficient by itself. The 128-group proof verifier component meets the threshold **at the recorded sizes, CPU models and runner state**. This is no guarantee for the complete protected system. The Windows ratios retain process CPU quantum effects despite longer measurement windows; report raw samples rather than pretending exact precision.

## Actual real Chromium and SCO private batch semantics

The existing real Chrome virtual-authenticator security fixture `test/sco-webauthn-origin-boundary-browser.js` was extended with an independently designated `proofBatch` server-private method in the real `src/sco.js::createScoHandler`. For this bounded test the method accepts **one array of exactly 128 safe-integer arguments**, produces a same-order array of the original `(Number(value)*17+29)>>>0` result, and increments an execution counter.

A trusted `/proof-challenge` endpoint authenticates the bearer cookie, accepts exactly the intended method and primitive array input and snapshots all 128 values into the one-use challenge record along with the session and random challenge. The actual SCO `authorizeOperation` then requires the same method, session and every array element **in order**, before independently verifying the browser's signed clientData challenge/origin, RP hash, required UP+UV flags and genuine ES256 signature. The challenge is consumed before private execution.

[Actual Chrome + Node22 focused manual CI 44878031547](https://github.com/FlareZ123/obfs/actions/runs/44878031547), same source head `3d963476ff6f5718cf6de8ed2cefbd42a020ea6f`, passed the original WebAuthn cookies/refresh/host tests, all new 128-element tests and both main/external strict JSDoc checks. The response and private-execution counters show:

| Attack or valid use | Expected and observed |
| --- | --- |
| Real authorized `localhost` browser signs exact 128-element batch | HTTP **200**, all 128 native outputs match |
| Copied-origin raw client has cookie, **no signed batch assertion** | HTTP **403** |
| Copied-origin substitutes one element of signed batch | HTTP **403** |
| Copied-origin swaps two elements of signed batch | HTTP **403** |
| Hostile code on legitimately admitted origin signs fresh batch; raw client forwards cookie and proof | HTTP **200**, same 128 outputs |
| Copied-origin reuses the accepted proof | HTTP **403** |

Exactly two `proofBatch` executions occurred, one from the original browser and one from the fresh allowed-origin relay. All no-proof, altered-argument, reordered-argument and replay checks denied before executing the server-private operation. The fixture also retained previous negative controls: origin mismatch, UV absent, forged signature, consumed login assertion, revoked bearer and missing session.

The proof commits to an exact **bounded array of 128 integer values**, not an arbitrary JSON object graph. The server holds the challenge map in process memory and uses a one-time challenge consumed by `authorizeOperation`. No production concurrency/replica/atomicity proof, credential counter/clone detection, request size abuse, nonce expiry or user-presence study was performed.

## Meaning and release veto

This candidate gives a measurable tradeoff: for the synthetic 500-round original work, one ES256 verifier per 128 operations brings the **server-only CPU component** below the 2.5x cap on both checked systems, whereas one verifier per 32 operations fails. The independently tested batch-binding policy prevents an exported cookie without a fresh valid signature from authorizing the exact 128-element operation, and prevents post-signature argument editing or replay.

The fixed SCO threat model still permits unlimited authorized-origin operations and online relay. The successful fresh signed batch forwarded to raw client is a direct negative against stronger claims of only running at the original client or resisting a genuinely authorized same-account relay. The batch proof is an authorization-layer hardening candidate for coarse protected operations. It is **not** static or dynamic code confidentiality proof and is independent of COO/SNO.

Crucially, the Chrome batch computes one arithmetic mapping per element, whereas the isolated CPU benchmark uses a much heavier 500-round operation. Its **end-to-end** browser signing, RPC serialization, network and server authorization overhead is unmeasured, and the browser's 128-element computation cannot inherit the CPU benchmark's positive ratio. A valid final 2.5x claim would require original and transformed *the same realistic app* and an equally trusted baseline with all overhead accounted for. Overall **RELEASE-BLOCKED** remains the correct decision.

## Reproduction

Use `.github/workflows/manual-sco-ratchet.yml` with `webauthn_boundary_only=true` to run real Chromium security/semantic tests on Ubuntu, and `proof_batch_cpu_only=true` to run Node22 paired verifier-frequency CPU tests on Ubuntu/Windows. No per-commit Actions are added. The source, test scripts and charter are all self-contained repository artifacts. Source code before this experiment remains the same except the security fixture, the explicit batching option to the CPU simulator, and manual workflow routing.
