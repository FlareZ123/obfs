# SCO closed-graph source commitments checked before server import

**Status:** intermediate engineering and deployment-consistency evidence. **Exact validated source:** `c8767efce6e033a99dba0f958f11137a3969f24c`. **Linux/Windows Node 22:** [targeted SCO graph run 43919220894](https://github.com/FlareZ123/obfs/actions/runs/43919220894), both jobs successful, including deterministic facades, 12 tests (nine publication tests and three graph tests), and strict JSDoc.

## Boundary and gap

`partitionScoAsyncGraph` had already used the original source bytes from each module in a closed ESM graph to produce public RPC facades, a set of private paths, and byte-exact original-source fingerprints. It did not give the example server an explicit **path-to-original-source** commitment that could be checked against the actual deployed private ESM files before the original graph was imported. The browser-side facade set could therefore be built from reviewed code A while the trusted server executed a changed source file B with the same export names. This is a build/deployment mismatch, not a client compromise under the project's trusted-server threat model.

The existing selective SCO helper `verifyScoPrivateSourceDigests` implements a path-aware realpath-constrained SHA-256 preflight. We reused it rather than building a second source verifier.

## Implementation

`src/sco-graph.js` adds `privateSourceDigests: [{path,sha256}]` to each returned graph partition. Digests cover **all original graph members**, including original implementations for modules whose public paths have been replaced with generated RPC facades. The source bytes are exactly those previously captured in the compiler's trusted input map. The existing private original digest array on each facade is derived from the new entries, preserving the existing source-publication guard.

The runnable `examples/sco-graph/server.cjs` now calls:

```js
await verifyScoPrivateSourceDigests(graph,path.join(__dirname,'before'));
```

immediately after `build()` and before executing any original ESM imports. This verifies that the deployed module bytes are the reviewed input bytes. It does not change the public facade source code, RPC behavior or network path.

The new regression writes two original ESM files into a fresh temporary tree using the repository's atomic write helper. It verifies the complete committed tree, changes one byte in the private dependency and checks for a filename-specific rejection, restores it, changes an original exposed module, checks another rejection, restores it, and verifies acceptance again. A separate manifest mutation case verifies that the composed graph handler's private seal rejects a changed source commitment. The existing end-to-end server integration and HMAC differential test passes with its startup preflight.

## Measured validation and limits

The two-platform workflow at `c8767ef...` passed all stated targeted steps. It did not separately benchmark startup verification, network latency or application-level 2.5× overhead. Each SHA-256 read occurs before importing the graph, so no new per-RPC cost was introduced. The project's runtime budget permits amortizing eligible trusted SCO server initialization, although this specific preflight has not been timed.

A concurrently writable filesystem has a time-of-check/time-of-use race between the digest read and Node's ESM import. The verifier does not create a transaction, enforce filesystem permissions, detect later runtime module replacement or authenticate the operator. A trusted deployment must keep the modules immutable during import. A compromised server can bypass any local check. This test supports build reproducibility and accidental deployment-error detection, with no claim of stronger COO/SNO full-control obfuscation or prevention of an authorized client relay.

The public graph output still needs independent source-delivery authorization, careful `exposedPaths` selection and a server-side RPC policy. See [the composed graph source-seal counterexample](sco-graph-postpartition-seal-2026-11-16.md) for a separate protection against post-partition manifest changes.

**Reproduction:** `node --test test/sco-graph.test.js test/sco-graph-private-path-policy.test.js` with Node 22 and declared dependencies; `npx tsc -p jsconfig.sco-graph.json`. Relevant source: [src/sco-graph.js](../src/sco-graph.js), [example server](../examples/sco-graph/server.cjs), [test](../test/sco-graph-private-path-policy.test.js).
