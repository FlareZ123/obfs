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

## Explicit post-red instrument-resolution amendment (21 November 2026, before rerun)

The first source-pinned [Ubuntu/Windows attempt 44877376674](https://github.com/FlareZ123/obfs/actions/runs/44877376674) produced complete Linux output but Windows rejected a **zero** `process.cpuUsage` delta in a single 4,000-call original batch (`measurement resolution`). The experiment did not reach a Windows ratio estimate. This is a measurement-system failure, not an observed semantic or security failure.

To obtain an interpretable Windows CPU delta while preserving the preregistered **exact 500 rounds per call, 4,000 calls per batch**, the next version will group **eight contiguous copies of that exact small batch** inside one timer interval. Each of the seven alternating A/B *samples* now contains 32,000 original or protected calls. The same aggregation applies on Linux, with the aggregation count reported. No kernel rounds, per-batch operations, proof verifier, or decision threshold changes. The coarse 250,000-round x60-call measurement remains unchanged because it did not show resolution failure. The original Linux receipt (0.77325 and 86.7965 CPU microseconds per operation, 112.25x small; 388.4167 and 471.9833 CPU microseconds, 1.215x coarse) remains unedited and must be referenced separately. This follow-up is a **new source-pinned measurement protocol**, not a rewrite of the initial preregistration or a retroactive success claim.

The Windows timer explanation is a hypothesis supported by the zero delta; do not assert a specific Windows clock quantum without a dedicated clock-resolution probe. Preserve raw output, whether positive or negative.

## Second visible clock-resolution amendment (21 November 2026, before third rerun)

The [8x-small aggregation run 44877508685](https://github.com/FlareZ123/obfs/actions/runs/44877508685) passed semantics and JSDoc on both OS. Windows small baseline and verifier CPU were finally measurable: 0.96875 vs 91.3125 microseconds per operation, **94.258x**, unequivocally over 2.5x. The Windows coarse 60-call measurements were *nonzero but quantized*: per-batch CPU values jumped between roughly **15,000/16,000** and **31,000/32,000** microseconds even though repeated wall times were approximately 24ms for the native batch and 29ms for the signed batch. Median CPU was 31,000 for both, yielding an apparent `1.0x`, which is **not a credible fine-resolution estimate**. Linux coarse gave approximately 1.22x server-only in the initial source-pinned run. The Windows coarse result must remain classified as **measurement-resolution-limited**, regardless of the numeric median.

For the third source-pinned run, retain all previously fixed workload parameters and seven alternating paired samples. Aggregate **eight contiguous copies of the same 250,000-round x60-call coarse batch** within each CPU timer interval, exactly as was done for the 500-round x4,000-call small batch. This changes only the duration of the measurement window, not the original work per operation, cryptographic verifier or decision threshold. Report aggregation=8 for both profiles. A terminal positive from the earlier quantized Windows median cannot be used as proof of 2.5x compliance. The aggregation change is timestamped before rerun and preserves both previous CI receipts.

This screen remains server-verifier-only and cannot establish full client/browser/network compute compliance.
