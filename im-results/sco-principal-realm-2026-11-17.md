# Experimental SCO principal-private ESM realms: source withholding, online relay, and budget veto

**Agent 31, 2026-11-17. Classification: intermediate experimental research, no generalized confidentiality, authorization, or performance theorem.**

## Executable evidence and scope

- Research branch and draft integration review: [PR #69](https://github.com/FlareZ123/obfs/pull/69), `agent31/sco-principal-realm-20261117`.
- Precommitted hypothesis, threat scope, negative controls and hard failure criteria: [principal realm charter](../workplace/sco-principal-realm-candidate-2026-11-17.md).
- **Fully passing targeted Ubuntu/Windows source pin:** [GitHub Actions 44158166664](https://github.com/FlareZ123/obfs/actions/runs/44158166664), exact tested tree `92ac75c04d371336efd9dd5f2be1f3d06b5f2c0d`, Node `v22.23.4` on both platforms. Existing 13 graph tests, two new principal-realm tests, one separate-public-attacker process test, two CPU profiles, targeted strict JSDoc and existing graph JSDoc all passed. This is a manually dispatched research workflow, not a universal project release gate.
- Original private ESM source commitments are **byte-identical on Ubuntu and Windows** after adding `.gitattributes` `eol=lf`: `private-api.mjs` SHA-256 `05fa9d3d71bb4a675fb1ad43cc209ea03f2f431f6e1bd5f12106b6a07a6f8047`; `private-counter.mjs` SHA-256 `a41aa6d7226e94d0898e8b71f957c363580c663091c7495f42cc7cb92dfcbc23`. The HTTP-session profile's generated public batch facade has SHA-256 `ba24cdf7f04454bd931111bbf0da51ef22d4732b3c82bfc1c2b034cbade652bf`. The independent attacker test separately recompiles with a fixed different seed and emitted facade SHA-256 `fcd51bd2b42e7188755a26a5156366e969b08a92e51f3dc4f34adfdebaeb67c1`.

## Architecture and behavior contract

The trusted SCO server takes the **original** two-file ESM graph. `private-api.mjs` imports `private-counter.mjs`, whose module-scoped integer counter mutates on each accepted call. A private server secret and an authenticated principal bind an HMAC-SHA256 result to each sequence and input. A repeat or out-of-order sequence is rejected by the original dependency, rather than being hidden in the transport layer. The browser/client receives only the `partitionScoAsyncGraph`-generated ESM RPC facade, never either original module.

`createScoPrincipalRealmPool` loads the same original entry path inside **one Node `Worker` JavaScript execution thread per verified server-side principal**. Every worker has its own ESM module loader/cache and its own copied `process.env` with an injected, independently verified principal. This is consistent with [Node Worker documentation](https://nodejs.org/api/worker_threads.html); our actual two-account test measures the relevant transitive state rather than presuming general isolation. The pool has explicit limits for simultaneous principals and queued methods, an opt-in `initialize(principal)` method to import server-only code before public work starts, and fail-closed `revoke(principal)` which refuses reuse of the same state identity. No worker reinitialization after termination is allowed within a pool. This remains trusted server code, with no sandbox against a compromised server.

The same source loaded twice from two cache-busted **entry** URLs inside one ordinary Node realm still shares its unchanged relative `private-counter.mjs` import. The test demonstrates the resulting stale-sequence failure. See [Node ESM URL caching semantics](https://nodejs.org/api/esm.html). That is a scoped, actual native Node counterexample against entry-URL-only cache busting, rather than proof that all server-side module variants require workers.

The compiler now accepts optional `batch:true,maxBatchCalls` for **multi-module SCO graph partitioning**, forwards the existing single-module batch implementation, and includes generated batch method IDs in its cross-module collision guard. Only explicit source-exported methods are callable. Authenticated batch operations execute sequentially and each item receives a generic result or error. Per-item operations are subject to the existing server authorization hooks when configured. The test confirms that batching ticks A's private counter in exact sequence and leaves B unaffected.

## Hostile-client observations

The sampled authenticated HTTP transcript tested A sequences 1,2, A race [200,500] at one sequence, rejection of stale sequence, A's fake `x-account:B` override staying under A's key, B's independent sequences, and generated client batch A sequences 7,8 with B unaffected. Source GET for the private dependency returned 404. The generated public ESM output did not contain the private module path, server-root source identifiers or original implementation canary. These observations support the **tested** policy/semantic boundary; they do not certify exhaustive equivalence of arbitrary JavaScript.

The separate `sims/sco-principal-realm-public-attacker.cjs` was run in another Node process with only an HTTP origin and valid Account A cookie supplied as arguments. The server root and principal environment variables were removed from its environment; the attacker code imports no repository modules and reads no private source files. It fetched and executed the actual public facade; its unauthenticated direct RPC returned **403**, its authorized A operation returned sequence **1**, and its attacker-operated uncredentialed-downstream HTTP proxy successfully produced A sequence **2** with the exact parent-computed HMAC tag. A fresh held-out B call returned sequence **1** with the different, correct B key. This control reproduced on Windows and Ubuntu at the source-pinned run above. It does **not** constitute an operating-system filesystem sandbox or a cryptographic non-leakage proof for arbitrary inputs. In the SCO threat model, **A's online relay success is expected and contradicts any claim of anti-functional-cloning for a holder of A's legitimate credential**.

## Strict sampled performance: RPC and initialization boundaries

Each CPU profile pairs the same native HMAC work against the actual generated facade, authenticated HTTP handler and private worker. Output, per-call sequence and callback-visible result equality are asserted for every comparison. For warmed local worker IPC only, 12 samples per fixed byte workload per OS had the following result at the source pin:

- **0 work bytes:** clear strict 2.5× veto. Linux median worker/native approximately **4×**, Windows similarly; many individual pairs exceeded 2.5×.
- **1 MiB HMAC:** low IPC-only median around **1.1×** on Linux and **1.2×** on Windows; no individual strict violation in the sampled 12 pairs on either platform.
- **8 MiB HMAC:** IPC-only median around **1×**; no sampled strict violation. These figures exclude HTTP/TLS and physical network round trips.

Explicit worker initialization before serving clients took **22.736 ms Ubuntu / 36.108 ms Windows** for the source-pinned HTTP-session profile, excluded from post-initialization compute only under the project's expressly permitted *trusted server initialization* exception. A new account initialized only after its first public RPC would need a different budget accounting. Actual server account admission, RPC JSON, worker IPC and response serialization are included in every full HTTP session below.

Measured **real-clock local HTTP full-session** medians from run `44158166664` (all cases use seven alternated paired order trials without added delay; cases with 25 ms artificial handler delay use three):

| Private workload | HTTP transport | Artificial server delay per request | Ubuntu paired median | Windows paired median | Observed strict >2.5× violations |
| --- | --- | ---: | ---: | ---: | --- |
| 64 × 0-byte | Individual RPCs | 0 ms | 112.68× | 119.20× | 7/7 each OS |
| 64 × 0-byte | One batch | 0 ms | 7.98× | 8.80× | 7/7 each OS |
| 64 × 1 MiB | Individual RPCs | 0 ms | 1.91× | 1.97× | 0/7 each OS |
| 64 × 1 MiB | One batch | 0 ms | 1.07× | 1.07× | 0/7 each OS |
| 16 × 1 MiB | Individual RPCs | 25 ms | 40.66× | 48.83× | 3/3 each OS |
| 16 × 1 MiB | One batch | 25 ms | 3.35× | 3.91× | 3/3 each OS |
| 64 × 1 MiB | Individual RPCs | 25 ms | 44.71× | 44.70× | 3/3 each OS |
| 64 × 1 MiB | One batch | 25 ms | 1.82× | 1.61× | 0/3 each OS |
| 16 × 8 MiB | Individual RPCs | 25 ms | 6.92× | 6.81× | 3/3 each OS |
| 16 × 8 MiB | One batch | 25 ms | 1.39× | 1.37× | 0/3 each OS |
| 64 × 8 MiB | Individual RPCs | 25 ms | 6.99× | 6.83× | 3/3 each OS |
| 64 × 8 MiB | One batch | 25 ms | 1.07× | 1.09× | 0/3 each OS |

**Hard decision:** the full original fixture accepts an input with zero work bytes and the published function exposes it. That input breaches 2.5×, even when 64 operations are batched. Therefore this implementation is **not eligible for a general 2.5× release** on its current unconstrained input domain. It is only a plausible SCO architecture for a separately specified application whose work granularity is already coarse and whose matched workload has been measured and rechecked. In one such scoped batch profile (16 × 8 MiB, 25 ms artificial delay), no strict sampled breaches occurred, but this does not establish universal future behavior.

The fixed 25 ms delay was injected before each server RPC and is a synthetic transport-control experiment. It does not reproduce TLS verification, Internet jitter, browser CSP/startup, multi-account resource contention, process crashes, OS scheduling distributions or real-world request queues. Synchronous native and remote wall times are compared inside one job, with alternate order per trial. These samples lack a statistical worst-case guarantee. The raw JSON ratios, including outliers, are printed by the CI job and generated reproducibly by `sims/sco-principal-realm-http-session.js`; never replace them with median-only pass assertions.

## Threat-model-axis assessment

| Axis | Evidence-supported bounded assessment |
| --- | --- |
| Static client reconstruction | Original private source unavailable through the served paths in this trusted-server configuration. Public method identity and result shape remain visible. No differential advantage over an **existing** well-configured authenticated SCO private operation was independently established. |
| Dynamic observation and extraction | Authorized A client and proxy observe all A arguments/results, including every sequence and returned HMAC. Same-account online relay succeeds. Worker implementation remains private from a client unable to compromise the server. |
| Modification / execution authorization | Server HTTP denies unauthenticated operations, unknown private files and stale state transitions; untrusted account override header does not select B. A valid A credential intentionally remains usable by an A proxy. No malicious-server, leaked-B-credential or global-policy-proof claim. |
| Semantics | Concrete 2-file ESM graph, per-account sequential HMAC, generated direct/batch facade, stale/race/overrides and exact output checks passed on two OSes. Unknown JS module side effects, non-cloneable values, reflection, worker-incompatible imports and browser scheduling are unproven or unsupported. |
| Compute and deployment | 0-byte path strictly violates 2.5× even in a batch. Delayed 16 × 1 MiB batch also violates. Coarse 16/64 × 8 MiB batches and 64 × 1 MiB batch have zero observed breaches in the sampled synthetic transport configuration, pending more realistic network and browser measurements. |

## Reproduction and open issues

Run the targeted [manual SCO graph workflow](../.github/workflows/manual-sco-graph.yml) on `agent31/sco-principal-realm-20261117`. It executes: `test/sco-graph*.test.js`, `test/sco-principal-realm.test.js`, `test/sco-principal-realm-public-attacker.test.js`, `sims/sco-principal-realm-profile.js`, `sims/sco-principal-realm-http-session.js`, and JSDoc checks. The report is intentionally confined to those executable artifacts; the default `src/index.js` does not export the worker research prototype.

Important next checks: independent security review of account proof/proxy behavior, injected worker failure during in-flight operations, startup/audit TOCTOU, real certificate-verified TLS with nontrivial RTT, browser-fresh generated facade, and an independently scoped CPU-only metric excluding network where the application contract demands it. A matched minified native baseline and independent adversary should be used before asserting any incremental obfuscation benefit over existing SCO partitioning. Since the original implementation resides on the trusted server in both architectures, this proposal currently supports a **state-isolation integration experiment**, with no demonstrated new anti-reconstruction gain over server-private SCO.

**Do not promote this document from `im-results/` into `results/` or claim general strong JavaScript obfuscation.**
