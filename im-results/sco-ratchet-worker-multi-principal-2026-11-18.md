# Multi-principal authorized CPU load breaks the unlimited-resident-worker SCO fairness pilot

**Agent 7, 18 November 2026 UTC. Status:** intermediate capacity/availability negative under a **conditional multi-principal credential adversary**, with no proof of code-obfuscation-specific overhead. Hypothesis, exact populations, native parity and stop criterion were [precommitted](../workplace/sco-worker-multi-principal-saturation-charter-2026-11-18.md) before code or computation.

## Exact executable source and CI

[Two-platform successful Node 22 + strict JSDoc run 44246049393](https://github.com/FlareZ123/obfs/actions/runs/44246049393), exact repository SHA **`030e29ae63d1e7ced54c4bc217708f89f74b9cf1`**, Ubuntu job `134605150477`, Windows job `134605150807`. Main script: `sims/sco-ratchet-worker-multi-principal.js`; authentic generated SCO endpoint and private workers: `sims/sco-ratchet-worker-http-contention.js`, `sims/sco-ratchet-tenant-worker.js`; truly independent B process: `sims/sco-ratchet-cross-account-worker.js`; reproducible targeted workflow `.github/workflows/manual-sco-ratchet-worker-saturation.yml`. Full raw per-trial output marker: `SCO_WORKER_MULTI_PRINCIPAL`. Both runners reported **4 available logical parallel processors**.

## Workload and strict assumptions

The protected server creates a real server-resident Node worker thread for **every accepted independent principal**, holding that principal's original, private ratchet machine and a shared server-side 256-bit root. Its front end is the actual generated `createScoHandler`, which authenticates verified random session cookies. Before timing, it grants and prestarts one quiet-B worker, one target-B worker, and **1, 4 or 8 separate A-principal worker threads**. This design has no global cap on workers per server.

Every A principal legitimately sends one independently authorized **64-event HMAC-SHA256** private batch, processing 8 MiB per event. The attacker work is concurrent; each A owns a distinct valid cookie, state sequence and principal. B independently submits one **16-event HMAC** HTTP request from a **genuine separate Node child process**, while A0's private worker is actively processing its original HMAC. A0 writes a one-shot atomic timing signal at HMAC entry; the test checks cross-process monotonic B submission strictly inside A0 worker private-start/end timestamps. A matched *quiet B cold child* supplies B HTTP startup control. Direct in-process original B timing uses the exact same root. Each accepted A and B output is compared against a separate original ratchet machine. There are **four trials per A count on both OSes**, and every A/B response is verified HTTP 200 with exact source-original output and A0 overlap.

The attacker capability to control **multiple independently verified principals** is a deliberate additional assumption. The primary objective allows unlimited legitimate requests, but does not itself guarantee unlimited account issuance. A single authorized A principal is a different threat population. These are CPU service-capacity measurements, not a source-confidentiality demonstration.

## Pinned output

| Authorized A principals | Worker threads (including B+quiet) | Ubuntu B/direct-original median | Ubuntu >2.5× | Windows B/direct-original median | Windows >2.5× |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 3 | 1.58550× | 0/4 | 1.62594× | 0/4 |
| 4 | 6 | 3.37580× | 2/4 | 3.07207× | 4/4 |
| 8 | 10 | 4.36159× | 4/4 | 5.72962× | 4/4 |

Both OSes preserved 4/4 positive output/HTTP and timing-overlap witnesses at every count. Total observed strict B/direct-original >2.5× pairs: **0/8 at one A**, **6/8 at four A**, **8/8 at eight A**. Increasing the number of legitimate A principals from one to eight, on runners with four available logical processors, raised B's absolute service-latency ratios from roughly 1.6× to **4.36× Ubuntu** and **5.73× Windows**.

Per-trial ratio evidence:

| A principal count | Trial | Ubuntu B/direct | Ubuntu B/quiet | Windows B/direct | Windows B/quiet |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 1.65144× | 1.01609× | 1.57728× | 0.99109× |
| 1 | 2 | 1.56664× | 1.07171× | 1.63127× | 1.07031× |
| 1 | 3 | 1.55409× | 1.06581× | 1.59536× | 1.05151× |
| 1 | 4 | 1.58550× | 1.06024× | 1.62594× | 1.09554× |
| 4 | 1 | 3.80496× | 2.58043× | 3.23971× | 2.09721× |
| 4 | 2 | 3.37580× | 2.25018× | 3.02629× | 1.94976× |
| 4 | 3 | 1.90458× | 1.27450× | 3.07207× | 2.08945× |
| 4 | 4 | 2.10939× | 1.41043× | 3.04797× | 2.01556× |
| 8 | 1 | 3.99821× | 2.65902× | 5.22701× | 3.56719× |
| 8 | 2 | 4.36159× | 2.94927× | 5.72962× | 3.80136× |
| 8 | 3 | 3.71924× | 2.49697× | 5.70308× | 3.63624× |
| 8 | 4 | 4.43886× | 2.96833× | 6.16603× | 4.11063× |

The quiet B/direct-native median remained close to **1.50× on Ubuntu** and **1.51–1.54× on Windows** across the cohorts. Loaded B/quiet median rose from about **1.07×** with one A to **2.95× Ubuntu / 3.80× Windows** with eight A. This separates basic child HTTP startup from simultaneous CPU saturation under many legitimate A workers.

## Interpretation and release stopline

One prestarted private worker per verified principal **helps the previously measured single-A case** but fails to guarantee B's tested service-latency threshold when many independently authorized A accounts occupy the server's limited CPU cores. Thread separation permits B admission at the HTTP event loop, but the OS still schedules A and B HMAC CPU on a finite processor allocation. Creating unlimited resident workers for unlimited principals would also consume unbounded server memory and worker initialization resources. A production candidate needs a **bounded** private worker pool, per-principal and global admission budgets, fair CPU scheduling and a specified behavior for over-quota valid requests. Rejecting or throttling some valid A requests may be necessary, and the policy must be evaluated under the objective's unlimited-request attacker.

These B/native ratios are **end-to-end service latencies** from an independent HTTP process, mixing network stack, startup and load effects. The original prompt's 2.5× constraint is a *compute overhead* budget; 8/8 observed strict service latency violations do not isolate incremental overhead attributable to obfuscation. A similarly provisioned and equally loaded **ordinary private HMAC Node worker service** could exhibit the same contention, as the earlier [equal-trust single-event-loop comparator](sco-ratchet-equal-trust-contention-2026-11-18.md) cautions. The test has only four trials per count and no real TLS/Chromium, WAN, mixed small RPCs, worker crashes or process CPU summation. No evidence of server root/key extraction, unauthorized B data access or SNO/COO secret integrity follows.

**Decision:** document a bounded multi-principal capacity failure in `im-results/`. Keep the [one-A worker benefit](sco-ratchet-worker-http-contention-2026-11-18.md) as valid only for its stated attacker. Do not promote an unlimited-session 2.5× fairness/security claim. Test a globally bounded worker pool and workload-aware admission with same original functions before proposing a release architecture.
