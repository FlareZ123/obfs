# Preregistered per-operation WebAuthn verifier CPU feasibility screen (2026-11-21)

**Agent 10. Classification:** isolated server-CPU lower-bound cost screen for the proof-bound SCO operation; not full browser-session evidence.

## Question

Our source-pinned [operation-bound WebAuthn experiment](../im-results/sco-webauthn-per-operation-boundary-2026-11-21.md) adds a fresh CTAP2 proof to each selected SCO private operation. A tiny JavaScript arithmetic function is intentionally used for semantic security probes. Is server-side WebAuthn proof verification alone already above the primary objective's 2.5x steady compute budget for such tiny functions? Can coarser original work amortize the added server-side verifier cost, leaving a plausible but unproven path for full-session admission?

## Fixed measurement and decision

Use Node 22's actual `process.cpuUsage` deltas (user+system microseconds) for paired repeated loops of **identical** original typed-int32 kernels:

- small protected operation: 500 branchy `Math.imul` rounds per call, 4,000 calls per batch;
- coarse protected operation: 250,000 rounds per call, 60 calls per batch;
- seven alternating A/B batches per workload after warmup and pre-generated proof material;
- A: original kernel with no WebAuthn verification;
- B: same kernel plus one real ES256 verification of a previously signed WebAuthn-like assertion for every call. Verify claimed clientData type/challenge/origin, RP SHA-256, required UP+UV flags, signed authenticator data, and `crypto.verify`. The same proof is reused for this isolated **computational primitive** screen, so challenge issuance, nonce storage, replay checking, session parsing, authenticator signing and network are excluded.

Measure batch CPU and wall elapsed separately; report median CPU per-operation and `B/A` ratio. Check native/output parity every batch. Use a fixed 16-record signed fixture bank built with ephemeral P-256 key in each process to avoid false artificial verification. Record Node, OS, CPU model, samples and benchmark parameters.

**Precommitted strict screen:** If small-workload median server-side `B/A` >2.5, then proof verification alone fails budget for that workload regardless of additional browser/network overhead. If coarse-workload CPU `B/A` <=2.5, it is only a **provisional server-verification** pass: a complete transformed SCO workload must still satisfy the actual 2.5x end-to-end compute rule, including browser/WebAuthn signing, challenge and RPC overhead. If coarse >2.5, it is another strict negative at this workload. No positive security claim follows from performance.

Run on Ubuntu and Windows in an existing manually-dispatched workflow with a focused CPU flag, no per-commit CI. Preserve raw samples and a source-pinned run in `im-results/`. Do not "fix" results by altering iterations after seeing them; any new workloads must be explicitly separate preregistration.

## Threat-model limit

This measurement does not investigate cryptographic soundness, same-origin online relay, authenticator hardware/user presence, browser CPU, session transport, process startup, cross-account contention, or arbitrary JS behavior. Those dimensions are evaluated separately in the repository. The underlying operation-bound proof boundary is still only a prototype.
