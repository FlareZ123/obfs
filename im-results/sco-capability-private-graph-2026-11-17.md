# Three-file closed SCO private-capability graph and source seal (17 November 2026)

**Status:** predeclared cross-file integration adversary, awaiting an immutable Actions run for the exact source. This is a directed test of cross-file trusted source separation, principal-scoped state, output fidelity and startup source-digest consistency. It is not cross-file object-property renaming or a general graph-closure proof.

## Scenario and hypothesis

The server privately loads a three-module Node ESM graph: api.mjs imports state.mjs, which imports secrets.mjs. The secret module contains a freshly generated 256-bit HMAC key. The state module uses principal-scoped opaque handles and advances a mutable position field over multiple public calls. Only api.mjs is selected for compilation as an HTTP-served ESM facade. Both private dependencies must remain unpublished and all private states must be held on the trusted server.

The real generated public ESM facade must issue a handle, process three inputs, reject cross-account bearer reuse, then process five more inputs under the original account, reproducing the same eight ordered HMAC digest outputs as the original server-private reference. Explicit revocation must make the handle unusable. Both private imports must return 404 when requested through the public SCO handler, while unauthenticated RPC must return 403.

The graph's privateSourceDigests include all three original source files. Replacing a single expression in the unexposed secrets.mjs after partitioning must cause verifyScoPrivateSourceDigests to reject the deployed tree. Restoring exact original bytes must pass again before private ESM import. The source mutation and restoration are strictly test-local; this does not prove protection against a compromised trusted server, racing writes after verification, or a modified launch process.

## Reproduction

~~~powershell
node --test test/sco-capability-private-graph.test.js
npx tsc -p jsconfig.sco-oracles.json
~~~

The test uses actual partitionScoAsyncGraph, createScoGraphHandler, verifyScoPrivateSourceDigests, createScoCapabilityScope and createScoPrivateHandles, with a real Node HTTP server. It reads the actual emitted api.mjs source from HTTP before importing it and checks for absence of key bytes, private HMAC code, canary and private ESM import specifiers. Remote source/code are not supplied to the learner or client. It checks eight genuine authenticated RPC HMAC outputs across distinct sequential batches, plus cross-account and post-revocation denies.

The private graph is constructed in a fresh temporary directory using atomic file writes. The same code and private key are used for the ground-truth reference, and separate account principal strings are supplied by a trusted server-side request callback. No user-controlled principal argument is accepted in the RPC JSON body.

## Scope and admission

A passing test would show a concrete three-file SCO source boundary and one shared mutable handle state surviving private ESM imports and multiple RPC calls with the supplied compiler and handler. This is a compatibility and limited source-withholding regression, not evidence that the attacker cannot query the original private service as an oracle. It would not prove arbitrary import closure, reflection safety, JavaScript property renaming correctness, client anti-instrumentation, physical-domain binding or a universal 2.5× runtime target. The source-digest check is a deployment consistency tool, not adversarial integrity against the complete SNO server-control threat model.

## Concurrency extension (predeclared before execution)

The initial graph test was extended to exercise the **actual HTTP request principal resolution**, with two separate authenticated principals each minting their own token, then concurrently issuing eight valid single-value batch RPCs against that token. The expected private state position should advance from 0 through 7 for each principal independently. Because completion order of genuinely concurrent HTTP requests is nondeterministic, the oracle compares the sorted multisets of the eight keyed digests for each principal to eight independent private reference HMAC outputs. Both principals then revoke their own handles. This is a real overlapping-promise test of per-principal private graph state and context, with two independent token records. It does not claim exact cross-principal scheduling determinism or a performance bound.

**Validation lineage:** The initial version (without simultaneous A/B RPCs) was included in [workflow 44154812743](https://github.com/FlareZ123/obfs/actions/runs/44154812743), source SHA 77779d7536ee3fdaa296f5a35538326c8aebd1e6. The concurrency extension is source 0b6ab0b63e0d28b46a3ad0dc7dbb698ca85d03b7 (or a later exact commit including only this doc). Do not attribute the concurrent pair result to the initial executable SHA; the final two-platform verification must be checked separately and pinned.
