# SCO server-private high-entropy keyed operation: bounded offline attack and RPC cost

**Date:** 2026-11-15. **Agent:** 50. **Status:** intermediate empirical evidence only. This study intentionally tests one simple, limited attack and one coarse workload. It does not establish a new cryptographic security result, general obfuscation strength, or an end-to-end browser/Internet performance guarantee.

## Question and experimental design

Earlier `sims/sco-oracle-exhaustion.js` conclusively cloned an otherwise secret-keyed HMAC service on its entire **256-input** domain with one authorized batch of 256 calls. The client never needed the key to reproduce every possible answer. That counterexample limits any unconditional claim that SCO server-private implementations resist behavioral extraction.

This study asks whether a materially larger input domain and a computationally expensive protected operation can preserve useful source confidentiality while staying under a **2.5× measured execution budget**.

Reproduce with `node sims/sco-high-entropy-prf.js`, installed dependencies, and Node.js 22+. The script generates a new uniform random 256-bit HMAC key for every run. The private ESM module validates exactly **32 lowercase hex digits** (128 input bits), then applies **15,000 HMAC-SHA256 iterations** to that input. The implementation and key remain on the assumed trusted server. `partitionScoAsyncModule` generates an ESM public proxy; `createScoHandler` serves it and authenticates both source read and operation. The script imports the actual publicly served proxy, sends HTTP requests to a live loopback server and checks native/private results against the returned RPC answers. No test parameter or result serializes the key.

The explicitly bounded attacker obtains only that legitimate public facade and its permitted outputs. It memorizes 12 chosen-input responses, then predicts unseen responses by table lookup with a fixed default digest for misses. The 24 held-out test inputs are disjoint from all queried values. This attacker cannot be described as a general deobfuscator or a general HMAC cryptanalyst; it neither forwards new held-out queries to the server nor attempts key search.

## Initial observed Linux/Windows results

**Pinned source:** `6fcf54352bfe28220fb26e83cbcdcd0b3946a3c1`. **Manual run:** [43716361071](https://github.com/FlareZ123/obfs/actions/runs/43716361071). Both platform jobs successfully ran the experiment and printed the observations below. The **overall workflow failed in the subsequent strict-JSDoc step** owing to two `Promise<void>` callback inference issues. Agent 50 subsequently committed callback-type corrections; do not interpret the first run as a complete green CI pass.

| Observation | Ubuntu Linux Node v22.23.4 | Windows Node v22.23.4 |
| --- | ---: | ---: |
| Unauthenticated public-source GET | 403 | 403 |
| Unauthenticated private RPC | 403 | 403 |
| Private key and implementation in served source | absent | absent |
| Authorized training queries | 12 | 12 |
| Answers reproduced for queried inputs | 12/12 | 12/12 |
| Held-out inputs correctly reproduced by table/default | 0/24 | 0/24 |
| Served public facade size | 591 bytes | 591 bytes |
| Local median for 3 serial operations (5 samples) | 93.084493 ms | 95.593800 ms |
| Authenticated loopback RPC median for 3 serial operations (5 samples) | 94.609078 ms | 98.098900 ms |
| Measured RPC/local ratio | **1.01638×** | **1.02621×** |
| Observed budget compliance for this workload | 2.5× passed | 2.5× passed |

The input fraction represented by a 12-item oracle table is only `12/2^128 ≈ 3.52648×10^-38` for uniformly sampled 128-bit inputs. Under an *ideal* independent uniform 256-bit response assumption, a fixed blind response guess matches a given unseen input with probability `2^-256 ≈ 8.63617×10^-78`. These are domain and ideal-function arithmetic, **not a proof** that this keyed construction behaves as an ideal random function under attacker-chosen access, or that 12 observations bound any smarter adversary's extraction ability.

The local baseline and remote test each invoke the same server-resident HMAC implementation for equal inputs, so their ratio isolates loopback HTTP/proxy/serialization overhead **at this coarse work granularity**. The result is sensitive to CPU, Node runtime, workload, sample size and network RTT. Initialization, key generation, file writes and server startup are excluded from the measured hot loop. No browser, Internet path, TLS, database session lookup, persistent deployment, concurrency isolation, side-channel attack or cache-invalidation scenario was exercised.

## Security boundaries and decision

- **Static source and key confidentiality:** Under the assumed trusted SCO server, sampled public source and RPC responses contained neither the random key nor the server-only HMAC implementation. The client receives the usable facade and can call it. Source-hiding is a real separation of deployed bytes from trusted bytes, within that narrow model.
- **Behavioral extraction:** A plain lookup-table attacker could not answer previously unseen inputs. An unlimited authorized attacker can still ask the server to compute any later input at will; the experiment supplies no usage quota, functional independence proof or protection from live oracle relay. Cryptographic hardness is assumed, and no independent cryptanalytic red-team challenge was run.
- **Tampering and authorized execution:** A forged client cannot enforce authorization itself. The test shows only that this server's simple session header policy rejects unauthenticated calls, while authenticated calls are allowed. A header value standing in for authentication is a fixture, not a production credential design.
- **Performance:** Measured 1.02× RPC overhead passes the specified 2.5× budget for one CPU-heavy chained-HMAC application on loopback. Earlier small-work RPC tests failed by orders of magnitude. The evidence supports selective coarse server-private operations with actual workload-based profiling; it does not support automatically moving arbitrary code into RPC.

**Next validation:** typecheck the JSDoc-corrected source on Linux and Windows, retain both red and green run SHAs, and challenge richer attackers (adaptive distinguishers, chosen-input stateful models, browser instrumentation of client facades) before making broader protection claims.
