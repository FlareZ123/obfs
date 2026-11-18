# Multi-account worker saturation: generated SCO versus equal-trust ordinary Node HTTP (18 November 2026)

**Status:** intermediate, source-pinned negative universal-fairness evidence. Both generated SCO and a conventional authenticated Node server use the exact same original 8 MiB-per-event private HMAC, 32-byte root, 64-event legal A batches, per-principal FIFO admission and prestarted resident worker topology. They differ only in their HTTP transport layer. The important observation is **strict loaded-B latency >2.5× under eight independently authorized A accounts in every tested pair in both server implementations and both OSes**. This is a capacity/fairness finding, not a standalone proof of a *compute-time* budget breach.

## Pre-registration and source

The [hypothesis and decision criteria](../workplace/sco-worker-equal-trust-saturation-preregister-2026-11-18.md) were committed before either result was examined. We extended the existing trusted worker [\`sample()\`](../sims/sco-ratchet-worker-multi-principal.js) to accept a Boolean conventional HTTP arm and an explicit source-paired root, while preserving its original generated-only test. A new [comparison runner](../sims/sco-worker-equal-trust-saturation.js) tests A counts **1, 4, 8**, with fresh private root each pair, all six original-output/HTTP status controls and truly independent B-child submissions during actual private A0 CPU work. Each arm executes exactly \`32+64*A\` original private HMAC events: 16 B quiet + 16 loaded B + 64 per A. Each A principal has its own valid session cookie and prestarted worker, not a forged attacker identity.

- **Cohort 1:** [two-platform run 44254918577](https://github.com/FlareZ123/obfs/actions/runs/44254918577), executable SHA \`d54ab47b5d5e78f4167d14831c9d839a0749c29b\`; 4 pairs per count and platform, strict JSDoc green, previous generated-only baseline green, all comparison controls passed. The initial displayed four-sample \`median()\` selected the upper middle; raw samples in \`SCO_WORKER_EQUAL_TRUST_SATURATION\` are unaffected.
- **Cohort 2:** independent fresh-root repeat in [run 44255266719](https://github.com/FlareZ123/obfs/actions/runs/44255266719), corrected executable SHA \`4c9d2d2b7b4904de56fdc7856e144294287f0292\`; all two-platform checks green. The new comparison uses the average of the two middle elements for even-length medians. No code changed in the trusted worker implementation or the authorization policy between cohorts.

Each pair alternates which handler runs first; every arm has an independently started authenticated server and exactly the same secret *within its pair*. The independent B request's monotonic submission timestamp falls within real A0 private-worker execution. The observed host in both runs had **4 logical processors**.

## Two independent four-pair cohorts

The table combines **eight paired observations per A count and OS**, and recomputes the conventional median from the full eight raw ratios. Within each row the *incremental* ratio is generated-SCO B-loaded HTTP milliseconds divided by ordinary-Node B-loaded HTTP milliseconds. Values near 1 indicate similar observed B service latency. The strict counts are numbers with B loaded HTTP duration / direct-native-original 16-event B computation duration **greater than 2.5**, not CPU-use ratios.

| Attacker A principals | Ubuntu paired generated/ordinary median | Ubuntu >2.5 B latency generated | Ubuntu >2.5 B latency ordinary | Windows paired generated/ordinary median | Windows >2.5 B latency generated | Windows >2.5 B latency ordinary |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | **1.00403×** | 0/8 | 0/8 | **0.99330×** | 0/8 | 0/8 |
| 4 | **1.05207×** | 7/8 | 5/8 | **0.95169×** | 5/8 | 3/8 |
| 8 | **0.98489×** | **8/8** | **8/8** | **1.05777×** | **8/8** | **8/8** |

The paired generated/ordinary ratio ranges at A=4 are particularly broad on Ubuntu (**0.83113×–2.03661×**), with one first-cohort ratio above 2 despite a roughly 1.05 pooled median. This reveals significant scheduling variance and prevents any claim of fine-grained CPU/latency superiority at four concurrent A principals. A=8 ranges: **0.75139×–1.43192× Ubuntu**, **0.94741×–1.20217× Windows**. Four A accounts were sufficient to produce strict B-latency breaches in both arms, but the precise tails varied by run and operating system.

For full auditability, these are the eight paired generated/ordinary loaded-B ratios per A count (cohort 1 trials 1–4, cohort 2 trials 5–8):

| A count | Ubuntu trials 1–8 | Windows trials 1–8 |
|---:|---|---|
| 1 | 1.01595, 0.96046, 1.01043, 1.00932, 1.17674, 0.87348, 0.99874, 0.99048 | 1.03297, 1.22922, 0.97868, 0.98187, 1.00896, 0.96039, 0.99209, 0.99450 |
| 4 | 1.55746, 0.96438, 2.03661, 0.83113, 1.08107, 1.02306, 1.02225, 1.11627 | 0.90147, 0.95466, 0.90865, 1.02540, 0.94871, 1.03743, 0.97264, 0.93225 |
| 8 | 0.93428, 0.94237, 0.75922, 1.34964, 1.43192, 1.14825, 1.02740, 0.75139 | 1.00898, 1.07152, 1.11366, 1.00807, 0.94741, 1.19707, 1.20217, 1.04401 |

The original CI JSON markers additionally preserve **all 48 paired-arm records per platform**, including native B 16-event durations, loaded/quiet B durations, per-arm loaded/direct ratios, A0 private execution time, request overlap flags, native parity and HTTP status controls.

## Interpretation and limits

The private worker placement improves a separate **single-A** experiment relative to a synchronous single Node event loop, yet it consumes finite shared CPU capacity. In these conditions, an eight-principal authorized A burst produces substantial B waiting in **both** generated and conventional services. Therefore the previously claimed resident-worker benefit is a generic server scheduling/capacity property and does **not** establish unlimited multi-principal QoS or incremental obfuscation resistance. The observed A=4 jitter across two cohorts reinforces the need for an independent paired control and bars broad claims from a single sample median.

**Threat-scope caveat:** The prompt grants the SCO attacker unlimited legitimate requests, but does not automatically grant eight separate verified accounts. A=4/A=8 therefore assume extra credentials. No method of obtaining those credentials is established or required for the conditional load experiment.

**Budget caveat:** B HTTP service latency / direct-native computation time includes **queue waiting and OS contention**. Such a ratio greater than 2.5 means a strict *service-latency* failure in this deployment scenario; it does not by itself establish that the protected program consumed more than 2.5× native **CPU compute**. The separate [80-event original-matched process-wide CPU comparison](sco-worker-equal-trust-process-cpu-2026-11-18.md) is the appropriate narrow CPU control and passed 0/7 CPU breaches per tested arm/OS. No observed run certifies a universal compute ceiling across all programs, client lifecycles or adversaries.

**Additional exclusions:** Worker initialization was before timing, as allowed for SCO server-side startup. We did not measure TLS/WAN, browser loading, all worker memory, resource exhaustion from unlimited account creation, independent client process CPU, attack cost, or source reconstruction. The ordinary baseline's authorization runs at a slightly different request-parsing stage, while verified complete-body traffic and the trusted worker function match. The comparison supports no anti-relay, license lock, or tamper-proof execution guarantee.

**Decision:** Preserve this as reproducible **negative capacity evidence** in \`im-results/\`, do not promote it into an academic or strong-obfuscation release claim. Future multi-principal mitigation should be compared against an equal-trust conventional service and accompanied by explicit bounded admission, worker-count and global CPU-resource policies. Release remains **BLOCKED**.
