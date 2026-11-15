# Server-private HMAC on a high-entropy SCO input domain: a positive control and RPC cost comparison

**Status:** intermediate applied threat-model observation, not an independent cryptographic proof. Agent 12, 2026-11-15.

## Motivation

Prior SCO probes from Agents 3 and 8 showed that a finite 256-point function can be cloned exactly with 256 authorized queries, and that a cubic scoring function can be cloned with five queries. Those examples demonstrate the power of the attacker's **unlimited legitimate oracle access**, without compromising the trusted server. A key question is which applications of SCO can preserve meaningful secret state while satisfying the 2.5× runtime requirement.

This study uses the existing `partitionScoAsyncModule` and `bindScoModuleExports` boundary with `serverOnlyInitialization:true`, keeping the private function source, a random 256-bit HMAC-SHA256 key and an 8 MiB processing buffer in a Node ESM module loaded only by the trusted server. A generated 1,150-byte public RPC facade exposes an authorized `authenticate(challenge)` operation that returns a deterministic 256-bit HMAC digest for a hexadecimal 128-bit challenge. The 8 MiB buffer deliberately makes each operation coarse enough that HTTP overhead can be compared under the target 2.5× budget.

Reproducible code: `sims/sco-large-domain-prf.js`. Manual-only cross-platform workflow: `.github/workflows/manual-sco-large-domain.yml`. Pinned head `e53db90d45c5c17c3903960f67b13c9b5e28e8cc`, green [GitHub Actions #43698774355](https://github.com/FlareZ123/obfs/actions/runs/43698774355) on Node.js 22.23.4 Ubuntu and Windows.

## Threat model and evidence

The client can inspect the complete generated facade, intercept HTTP responses and issue unlimited legitimate authenticated calls. It cannot inspect the server's private module, filesystem, runtime memory or random HMAC key. The server handler uses both an authenticated request policy and argument-level operation authorization; it verifies each batch member before executing any protected work. An unauthorized read returned 403 and an unauthorized RPC returned 403 with **zero** private executions.

The baseline attack records a dictionary of 64 selected, legitimate oracle calls and successfully replays the 64 known outputs. Another 64 deterministic, independent 128-bit challenge values have no entries in that transcript (0/64). All challenge values are computed from labeled SHA-256 hashes of public indices, so the caller need not know the server's key. The test does not attempt advanced key recovery; HMAC's pseudorandom-function security is a separate, standard cryptographic assumption. An attacker who can call the legitimate server on demand can simply obtain any desired held-out output online. A 0/64 lookup outcome **does not** demonstrate resistance against unrestricted online oracle access or establish a query-complexity lower bound.

The generated public client source contains neither the HMAC invocation nor the key/secret initializer, and no observed response includes raw source. This is a real trusted-execution boundary, unlike local COO and server-owner-controlled SNO binaries. It is distinct from recovering the source via static or dynamic deobfuscation.

## Performance

Each measurement compares the **same native private function** against 12 sequential authenticated JSON RPC requests and a single authenticated 12-call batch. One operation hashes the same 8 MiB constant block plus its 128-bit challenge with a 256-bit secret key. Each path checks identical output digests. Nine alternating-order rounds are measured after warmups, reporting the median. HTTP runs on `127.0.0.1` in the **same Node process**, no remote network RTT/TLS/authentication I/O is simulated.

| OS | Twelve local calls | Twelve serial RPCs | One 12-call batch | Serial ratio | Batch ratio |
|---|---:|---:|---:|---:|---:|
| Ubuntu | 63.7705 ms | 74.7279 ms | 65.2384 ms | **1.1718×** | **1.0230×** |
| Windows | 56.1597 ms | 68.6763 ms | 57.3987 ms | **1.2229×** | **1.0221×** |

The measured ratios pass the requested 2.5× budget for this **one coarse protected workload**. The 8 MiB work is part of both original and protected algorithms. It must not be added artificially to a cheap function solely to hide RPC overhead. Private module initialization and code generation are excluded, consistent with the server-side SCO allowance; the reported timing includes operation CPU and RPC traversal. Performance over real remote links, short methods, slow clients, mixed concurrent traffic, HTTP retries and distributed load is unknown. Prior `sims/sco-rtt-grid.js` measured some such overheads for other workloads.

## Simulated 25 ms per HTTP request

The same protected HMAC experiment was extended with a controlled 25 ms **asynchronous wait inside `authorizeRpc` before each authenticated request**. This models a per-request network/policy latency component without claiming to reproduce a real remote network, TLS, packet loss or authentication system. Original CPU work is unchanged; exactly one wait is charged for a batch and twelve waits for serial RPCs. Five alternating-order rounds compare equivalent 12-call workloads.

| OS | Twelve local calls | Twelve serial RPCs + 25 ms/request | One 12-call batch + 25 ms/request | Serial ratio | Batch ratio |
|---|---:|---:|---:|---:|---:|
| Ubuntu | 48.7999 ms | 369.8766 ms | 76.0495 ms | **7.579× (fails)** | **1.558× (passes)** |
| Windows | 63.8355 ms | 411.6635 ms | 92.9515 ms | **6.449× (fails)** | **1.456× (passes)** |

Pinned amended source: `dbd53c59ac034c64ce462224e863104836550b72`. Green manual [CI #43700173996](https://github.com/FlareZ123/obfs/actions/runs/43700173996) on both Node.js 22 runners, including the original no-delay control and the new 25 ms simulated check. Differences in CPU-only baseline times relative to the first experiment reflect runner variability and do not alter the observed pattern. This is a direct measured example where batching is **required** to satisfy a 2.5× end-to-end wall-time budget for the same private business operation once moderate request latency is introduced. A real deployment must measure its own RTT/TLS and concurrency.

### Approximate latency budget derived from the zero-delay controls

If each of 12 serial requests adds a fixed delay `L` and all other costs stay constant, the 2.5× threshold is `(2.5 × nativeMedian - serialMedian) / 12`. A single batch pays the delay once, giving `2.5 × nativeMedian - batchMedian`. Applying this **linear model** to the zero-delay medians produces:

| OS | Approximate maximum added per-request delay, 12 serial RPCs | Approximate maximum added single-request delay, 12-call batch |
|---|---:|---:|
| Ubuntu | **7.058 ms** | **94.188 ms** |
| Windows | **5.977 ms** | **83.001 ms** |

These are extrapolated engineering estimates, **not** hard guarantees. Async scheduling, concurrency, CPU turbo/JIT changes, RTT distribution and application work can violate a simple additive model. The directly measured 25 ms simulation above is the stronger evidence point.

## Five dimensions, independently evaluated

1. **Static program reconstruction:** the private HMAC source and random secret key do not appear in public modules. Only server-retained source is protected, following the explicit SCO trust model.
2. **Dynamic instrumentation / runtime extraction:** client instrumentation can observe queries, responses and the complete client facade, but receives no server memory. No server debugger compromise was simulated.
3. **Unauthorized modification / authorization:** denied source and RPC calls returned 403. No private method executed on denied input in the test. Authorized replay and online proxying remain possible; the public method identifier is not a credential.
4. **Environmental locking:** authorization is based on the example `x-session` header and argument validation, serving as a test fixture rather than production identity verification. A user-controlled header itself is not an authentication mechanism in a real deployment.
5. **Performance / compatibility:** batch 1.02× and serial 1.17–1.22× for a 12-call CPU-heavy loopback workload, with exact JSON result equivalence. No arbitrary-JS semantic preservation is implied; the selected module explicitly assumes JSON-compatible arguments/results.

## Research decision

The strongest defensible direction in this threat model is **keep security-sensitive implementation state on the trusted SCO server**, execute appropriately coarse, authenticated operations there, and benchmark the complete client/server workflow including real RTT and policy checks. Do not promise offline confidentiality for client-executed COO/SNO code or assume that exposing a callable authenticated oracle prevents authorized functional replay.

The main open tradeoff is *granularity*: small protected operations carry high remote overhead, while coarse work with actual business utility can amortize it. Authentication, quotas, anti-replay policies, rate controls and hardware-backed attestation might limit some abuse in specific applications, but the prompt's unlimited legitimate-request attacker still can query the allowed functionality. Avoid equating standard HMAC secrecy with general obfuscator resistance.
