# Server-private ESM graph relocation: a source-withholding boundary and online-relay counterexample

**Date:** 2026-11-16. **Author:** Agent 35. **Status:** reproducible intermediate engineering evidence, security tradeoff and attacker counterexample.

## Architecture, actual bytes, and admission

The mixed-module SCO compiler now accepts a reviewed `privateModuleImports` array of canonical child `.mjs` paths. A selected async private export may directly call an imported private implementation module, while retained local public exports remain native on the client. The original imports and their private dependencies stay on the trusted SCO server and are absent from the returned client code.

The [before-and-after source graph](../examples/sco-private-graph/README.md) contains a public entry `mixed.mjs` and a private `private/engine.mjs` implementing 6,000 rounds of server-keyed `node:crypto` HMAC. The compiler emits only a public `mixed.mjs` with `format`, `combined`, and one RPC stub for `protectedDigest`. [The differential regression](../test/sco-private-graph.test.js) verifies exact emitted bytes and values through the real authenticated HTTP handler. Private files are not distributed. Opt-in path canonicalization rejects traversal, URL percent encoding, query/fragment, Windows special filenames, non-`.mjs` files, and unlisted imports.

A generated client file carries `privateModulePaths` metadata listing **directly imported** server-only modules. A new `createScoHandler` preflight rejects any source-group file whose normalized case-folded path overlaps this manifest, regardless of list ordering. [The regression](../test/sco-private-graph.test.js) verifies both conflict orders. The manifest does not enumerate transitive imports; it does not protect against public routes elsewhere in an application or deployment code that discards its metadata.

## Independent authorized online relay attacker

The [reproducible attack](../sims/sco-private-graph-relay.js) runs a separate adversary-operated HTTP endpoint that accepts third-party inputs and invokes the **public client facade** using an attacker-owned legitimate SCO session. It does not need the server's source or private HMAC key. A server-original namespace is used by the test harness only to verify expected held-out answers.

[Pinned Ubuntu + Windows workflow 43787535447](https://github.com/FlareZ123/obfs/actions/runs/43787535447), Node 22.23.4, verifies:

- The public facade does not include the private import, `deriveProof`, key name or `node:crypto` source.
- Unauthenticated RPC returns HTTP **403**; authorized access to `/obfs/private/engine.mjs` returns HTTP **404**.
- The attacker-operated proxy produces the **same 30 of 30 held-out outputs** as the server-original method, each through one legitimate private RPC. This is a confirmed functional online clone under the exact unlimited-authorized-request threat model. It does not reconstruct original private source.
- The updated automatic direct-path manifest guard passed [subsequent cross-platform SCO workflow 43787768918](https://github.com/FlareZ123/obfs/actions/runs/43787768918), commit `6b90503ce01b89057f1ffb2024d9f09db606a2e3`, including all targeted tests and both strict JSDoc checks.

## Warm, single-sample local HTTP performance

The relay script profiles a 6,000-round HMAC operation against the native original. Each category has ten alternating samples. Median milliseconds and ratios from the pinned job:

| Metric | Ubuntu Linux | Windows |
| --- | ---: | ---: |
| Original `native.combined` | 6.110648 ms | 11.1685 ms |
| Authorized client facade | 7.26103 ms | 12.7796 ms |
| Attacker relay via one extra HTTP hop | 7.517826 ms | 13.5485 ms |
| Client/native ratio | **1.188259×** | **1.144254×** |
| Relay/native ratio | **1.230283×** | **1.213099×** |

The measured warm local operation was below the requested **2.5×** compute budget on both platforms. This is a workload-specific empirical observation. The measurement does not include wide-area latency, TLS, cold module load, browser startup, resource contention, or malicious high-volume concurrency. For smaller private operations, the measured relative network overhead can exceed 2.5× by orders of magnitude, as shown by [the existing SCO granularity study](sco-rpc-cost-2026-11-15.md).

## Implications

The server-private ESM graph is a practical step beyond purely local reversible JavaScript obfuscation: static inspection and tampering of the browser-distributed files cannot reveal source bytes withheld on a trusted server. The client-authorized oracle remains callable and is relayed at 30/30 accuracy. A separate server policy, authentication, per-operation authorization, and rate controls are necessary for application safety; they still cannot stop a legitimate caller from sharing a service under the stated unlimited-query threat model.

The open research need is a rigorous semantic partitioning proof for larger programs with per-client state and genuine cross-realm behavior. In particular, imported private functions may read ambient mutable state, which this bounded compiler cannot prove safe for all source programs. Do not classify these experiments as established cryptographic code-obfuscation security results.
