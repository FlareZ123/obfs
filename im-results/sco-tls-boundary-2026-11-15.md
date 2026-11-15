# Certificate-validated SCO transport granularity: local HTTPS measurements

**Status:** Intermediate, independently runnable transport experiment on one Linux Node 22 runtime, 2026-11-15. This is a validation of the SCO cost model under TLS, not a claim of improved obfuscation security. The implementation is [sims/sco-tls-boundary.js](../sims/sco-tls-boundary.js). Run `node sims/sco-tls-boundary.js` on Node 22+; the final `JSON_REPORT=` line includes all raw paired timing samples.

## Method

A local HTTPS/1.1 server runs a 256-bit, randomly keyed, sequential HMAC-SHA256 chain. For each public input, the client receives only the 64-hex output, never the server secret. The deterministic native baseline invokes the identical keyed function in-process using the same input and HMAC round count. One bearer credential gates the RPC; a deliberately incorrect token returns **403**, while a client that does not trust the local certificate is rejected by TLS. The *benchmark* client explicitly trusts the self-signed fixture CA, enforces TLS 1.3, and validates exact HMAC outputs for every comparison.

Two request styles are measured with five paired samples per cell: **reused** HTTPS keep-alive connection, and **fresh** TLS connection with session resumption disabled (`maxCachedSessions:0`). The alternating order reduces monotonic JIT effects. The test injects server-side waits of 0/25/100 milliseconds before execution. These are application-level delays only, **not measured geographic network latency**. The one-process loopback setup omits DNS lookup latency, WAN congestion, TLS proxying, cross-host resource contention, browser CORS/CSP, database-backed access policy, and realistic server authorization. No public compiler-generated RPC facade is run: this experiment isolates the underlying transport cost.

Node **v22.16.0**, Linux x86-64, **AMD EPYC 9V74 80-Core Processor**, with ephemeral random key/session for each run. All 45 measured native-vs-RPC outcome comparisons succeeded per run; the fixture's certificate was rejected in the deliberately untrusted control, and unauthorized RPC returned 403. Two independent invocations were executed locally. Each pair below shows **run 1 / run 2** whole-call median ratios.

| Injected wait | HMAC rounds | Connection reused vs native | Fresh TLS vs native | Within 2.5x in both runs? |
|---:|---:|---:|---:|---|
| 0 ms | 1,000 | 1.69x / 2.11x | 3.44x / 2.79x | Reused only |
| 0 ms | 20,000 | 1.06x / 1.03x | 1.13x / 1.13x | Both |
| 0 ms | 100,000 | 1.04x / 1.02x | 1.02x / 1.03x | Both |
| 25 ms | 1,000 | 14.75x / 15.08x | 16.63x / 17.55x | Neither |
| 25 ms | 20,000 | 1.72x / 1.59x | 1.73x / 1.80x | Both |
| 25 ms | 100,000 | 1.16x / 1.10x | 1.17x / 1.11x | Both |
| 100 ms | 1,000 | 56.34x / 47.83x | 57.40x / 49.10x | Neither |
| 100 ms | 20,000 | 3.29x / 3.45x | 3.31x / 3.56x | Neither |
| 100 ms | 100,000 | 1.48x / 1.53x | 1.51x / 1.57x | Both |

## Interpretation

A real local TLS handshake has measurable cost even with zero injected wait. In this experimental kernel, the 1,000-round fresh-connection case exceeded the **2.5×** cap in both runs, while connection reuse passed both. An added 25 ms wait made this same small operation >14×. At 100 ms added wait, 20,000 HMAC rounds still failed; 100,000 HMAC rounds passed. This confirms a concrete granularity threshold for *this chosen workload*, with exact behavior checked.

SCO withholding of server code/keys is a valid static delivery boundary if its trusted host is maintained. The published obfuscator's [authorized online relay challenge](sco-large-domain-prf-2026-11-15.md) separately shows that a legitimate user with unlimited allowed requests can reproduce held-out results by forwarding through their own server. HTTPS and bearer authentication do not remove that attacker capability. These measurements do not show tamper-resistance or anti-cloning, and should not be extrapolated to arbitrary applications.

**Operational research priority:** combine a compiler-generated SCO facade and trusted authorization with measured physical Internet RTT/TLS on separate hosts, then compare representative whole-session workloads and attacker-operated authorized relays. Keep startup and repeated per-operation latency distinct. The public test certificate and key in `sims/fixtures` are intentionally insecure *local testing fixtures*, never deployment material.
