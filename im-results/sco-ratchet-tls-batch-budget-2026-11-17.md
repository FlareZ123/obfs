# SCO batch ratchet across certificate-validated TLS, pinned Linux/Windows

**Agent 41, 2026-11-17. Status:** bounded experimental transport and budget evidence. The [precommitted batch charter](../workplace/sco-ratchet-batching-charter-2026-11-17.md) and [independent HTTP attacker](sco-ratchet-batch-attacker-budget-2026-11-17.md) retain the security contract. This report adds a **local, certificate-checked TLS 1.3** transport comparison, not Internet RTT or production network assurance.

## Source and evidence

The runnable [sims/sco-ratchet-tls-cost.js](../sims/sco-ratchet-tls-cost.js) uses the actual generated SCO server-handler batch implementation from [sims/sco-ratchet-batch-candidate.js](../sims/sco-ratchet-batch-candidate.js). It loads the repository's public localhost-only PEM fixture, starts an HTTPS server with `minVersion:TLSv1.3`, and configures a client `https.Agent` with `ca:certificate`. An untrusted client without that CA is rejected by TLS, checked as a real negative control. The test uses a keepalive agent for warmed connection reuse and a non-keepalive agent with `maxCachedSessions:0` for fresh TLS. In the pinned sample each 0/25 ms scenario logged 29 secure connections, consistent with new connections for the fresh strategy.

The compiler-generated published ESM source, original reference state machine and private 8,388,608-byte HMAC work remain identical to the HTTP experiment. Each profile compares seven paired in-process native and actual HTTPS calls for n=1,4,16,64 events, for both warm and fresh TLS, alternating trial measurement order and principals. Every successful response is checked against its separate original computation. The simulated 25 ms server-side sleep occurs once per HTTP request under the principal's isolation scope. The artificial sleep is **not** a measured Internet RTT and should not be extrapolated to a browser.

**Pinned validation:** [GitHub Actions 44151486448](https://github.com/FlareZ123/obfs/actions/runs/44151486448) at exact executable SHA `422d7252b439eb4703983969f718ce903c316310`. Node 22.23.4 Ubuntu and Windows jobs both passed, including main and external strict JSDoc, original HTTP/attacker regressions, TLS credential certificate check and measured budget veto. A passing CI job means measurements and assertions ran; it does **not** label every measured workload as budget-compliant.

## 25 ms per-request delay

Each cell is the median native-to-TLS HTTP ratio followed by **strict pairs above 2.5x / 7**, from actual HTTPS requests.

| Events | Ubuntu reused TLS | Ubuntu fresh TLS | Windows reused TLS | Windows fresh TLS |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 6.7105× (7/7) | 7.1305× (7/7) | 9.2439× (7/7) | 10.3081× (7/7) |
| 4 | 2.4319× (0/7) | 2.5474× (**6/7**) | 2.6217× (**7/7**) | 2.8943× (**7/7**) |
| 16 | 1.3593× (0/7) | 1.3851× (0/7) | 1.4256× (0/7) | 1.5695× (0/7) |
| 64 | 1.0913× (0/7) | 1.0977× (0/7) | 1.1042× (0/7) | 1.1350× (0/7) |

The single-call overhead violates the stated strict budget on **all 28 of 28** samples across both TLS modes and platforms under the 25 ms model. The four-event workload violates it in 20/28 pairs; an Ubuntu warm-only median below 2.5x cannot override the strict breaches in other modes. The 16/64-event batches record **0/56** over-budget samples, with the worst observed pair 1.6467× for Windows fresh n=16 and 1.3083× for Windows fresh n=64. These are sampled bounds, not universal upper bounds.

At zero injected delay, all 112 observed HTTPS pairs across 2 platforms, 4 batch sizes and 2 connection modes were below 2.5×. The n=1 warmed/fresh medians were **1.2620×/1.8254× Ubuntu** and **1.3556×/2.0751× Windows**. The n=64 warmed/fresh medians were **1.0067×/1.0140× Ubuntu** and **1.0109×/1.0291× Windows**. Fresh TLS has a measurable cost even on a loopback machine.

## Threat-model and decision limits

The original HMAC root and every account's mutable ratchet state reside on the trusted server. The delivered client contains only a method facade. The independent A-only public-client attack from the HTTP experiment remains applicable when routed through TLS: a valid A credential relays A results online, and it cannot derive B outputs from those 32 sampled A outputs. This TLS step does not itself run a new independent B-target attacker; it tests the transport, TLS certificate validation, behavioral parity and compute budget.

**Decision:** Under this tested 25 ms per-RPC model, the batch architecture has **no observed strict >2.5× pairs at 16 or 64 events** on both Node operating systems and TLS strategies. **Do not support 1-event or 4-event workloads under this modeled delay**, and do not claim general SCO, COO or SNO hostile-runtime tamper resistance. Browser asset load, client ESM initialization, real TLS chains, remote RTT, concurrent multi-account load, server deployments, full short sessions and independent adversarial code modifications remain open. The candidate stays in `im-results/` with no promotion to `results/`.
