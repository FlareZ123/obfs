# Per-operation SCO WebAuthn server-verifier CPU screen and batching lower bound (2026-11-21)

**Agent 10. Classification:** reproducible intermediate **server-side CPU** evidence for the operation-bound WebAuthn prototype. It does not establish the strict 2.5x full-system requirement.  
**Preregistration and visible measurement amendments:** [charter](../workplace/sco-webauthn-proof-cpu-charter-2026-11-21.md).

## Candidate and workload

In [the real Chromium security experiment](./sco-webauthn-per-operation-boundary-2026-11-21.md), selected SCO private operations require a fresh WebAuthn assertion and a bearer-authorized session. The present screen measures whether **just server-side ES256 proof verification** is computationally affordable.

A self-contained [CJS reproducer](../sims/sco-webauthn-proof-cpu-budget.js) runs a deterministic, output-dependent `Math.imul` Int32 workload with the same input in two arms: (A) the native kernel and (B) the identical kernel plus one verification per call. The verifier checks a signed WebAuthn-like `clientDataJSON` type/challenge/origin, authenticator RP hash, UP/UV bits and genuine P-256/ES256 signature with Node `crypto.verify`. An ephemeral key and 16 valid signed fixture records are created outside the timed region. All paired checksums are identical.

The fixed two workloads are (small) 500 rounds per call with 4,000 calls per batch, and (coarse) 250,000 rounds per call with 60 calls per batch. Each profile uses seven alternating A/B paired samples, reporting Node `process.cpuUsage` (user + system microseconds) and separately captured wall times. The final method aggregates **eight contiguous copies of each fixed batch** into one CPU measurement, so 32,000 small operations and 480 coarse operations per arm and sample. Aggregation increases the measurement interval while preserving original work per operation, verifier implementation and 2.5x criterion.

The [regression](../test/sco-webauthn-proof-cpu-budget.test.js) asserts native/protected checksums, seven samples, batch sizes, aggregation, typed finite results and project input/output safety. The job is invoked by `.github/workflows/manual-sco-ratchet.yml` with `proof_cpu_only=true`. Both Ubuntu and Windows are included.

## Full measurement provenance, including failed attempt

The first [source-pinned CI 44877376674](https://github.com/FlareZ123/obfs/actions/runs/44877376674) had a Linux complete result and a **Windows red** on a zero `process.cpuUsage` delta for the short original batch. Its Linux small and coarse ratios were approximately 112.25x and 1.215x. These values remain recorded and were never overwritten.

The second [source-pinned CI 44877508685](https://github.com/FlareZ123/obfs/actions/runs/44877508685) grouped eight 4,000-call small batches per timer interval, preserving the original kernel. Both OS passed. Windows small became measurable (approximately 94.26x), but Windows coarse CPU readings were visibly quantized, jumping between about 15,000 and 32,000 microseconds, with a spurious 1.0x median. That coarse CPU ratio was explicitly deemed **inconclusive** rather than counted as a pass. The second preregistration amendment extended the same eightfold aggregation to coarse batches.

**Final source-pinned run:** [manual CI 44877638588](https://github.com/FlareZ123/obfs/actions/runs/44877638588), commit `046861a487c87aa467a5a348044dca64efdb0423`. Ubuntu and Windows both passed the paired CPU test and strict external JSDoc checks on Node v22.23.5. The benchmark emitted all seven raw paired samples for each profile in the workflow logs.

## Final server-only CPU medians

| Platform | Small original µs/call | Small with proof µs/call | Small ratio | Coarse original µs/call | Coarse with proof µs/call | Coarse ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Ubuntu, Intel Xeon Platinum 8573C | 0.6770 | 75.4617 | **111.46x** | 350.2479 | 422.5750 | **1.2065x** |
| Windows, AMD EPYC 7763 | 0.9688 | 92.2813 | **95.26x** | 389.5833 | 487.5000 | **1.2513x** |

**Small workload:** server verification alone is many times over the required 2.5x compute ceiling on both tested runners. This is a **strict veto** for this per-operation proof architecture on the preregistered small kernel, even before the omitted browser signing and transport costs.

**Coarse workload:** the isolated server verifier ratio remains below 2.5x for the exact tested kernel. This is only a **provisional component-level feasibility** observation. A complete SCO application must still account for authenticated challenge issuance, browser-side authenticator signing and verification-related work, network/session transport, concurrency and real user gestures. The full protected compute ratio has not been measured and may exceed 2.5x.

### Analytic batching implication, explicitly conditional

Under the simplified additive model with per-native-operation CPU `c` and one independent server-verification increment `v` per batch of `B` operations, the measured server-only ratio is approximately `1+v/(B*c)`. The 2.5x condition requires `B >= v/(1.5*c)`. Using final small-workload median differences gives:

- Ubuntu: `v ≈ 74.7847 µs`, modeled minimum `B=74`.
- Windows: `v ≈ 91.3125 µs`, modeled minimum `B=63`.
- At `B=128`, the same arithmetic model predicts server-only ratios around 1.86x and 1.74x, respectively.

These are algebraic implications of the **isolated** measurements, not empirical evidence of a secure 128-item batch. Actual per-batch proof verification may have additional argument commitment, JSON size, challenge and concurrency overhead. A production result needs an actual batched SCO implementation and matched browser/client/full-session profiling. The current prototype signs exactly one numeric method argument at a time.

## Validity and architecture decision

The benchmark reuses a pre-generated valid signature repeatedly on purpose, solely to measure the CPU cost of the verification primitive. A real operation-authorizing server **must reject replay**, as the independent browser security fixture already demonstrates. Key creation, challenge generation, browser hardware signing, request deserialization, RPC transport and live session policy are omitted from this timed region. These omissions make the benchmark a **lower-bound screen** on overhead, never a complete upper bound on cost.

Different runner CPUs, noise, cache effects and Windows CPU accounting quantization limit cross-platform numeric generalization. The serial work and per-call output are fixed across each paired arm. The two preregistered timing-window amendments were recorded *after* observing their respective measurement failures, and both original receipts remain accessible.

**Decision:** Reject mandatory per-call WebAuthn verification for small arithmetic kernels under the 2.5x compute rule. Preserve coarse, optionally protected SCO work as an unproven candidate that needs a production-grade method/payload-bound protocol, independent matched hostile-client evaluation, and an end-to-end compute gate. The unrelated same-origin online relay stopline remains valid. The overall project remains **RELEASE-BLOCKED**.
