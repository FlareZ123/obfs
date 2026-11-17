# Selective SCO sealed publication entry point

**Date:** 2026-11-17. **Agent:** 35. **Status:** bounded implementation and integration regression; exact-head cross-platform CI pending at initial write. This is an intermediate deployment-safety result, not proof of strong obfuscation.

## Motivation and negative control

An integrator can call `createScoHandler` with an arbitrary `sourceFiles` array. An audited selective SCO partition carries private dependency paths, so the handler refuses directly listed private modules and transitive static dependencies when metadata is complete. Earlier experiments show that indirect runtime loaders escape the bounded closure audit. Under misconfiguration, an extra private file in the public handler list can still be served through a path absent from the static manifest. This class of exposure should not depend on exhaustive filename or dynamic-module discovery.

The engineering hypothesis is that a selected SCO deployment with exactly one generated client ESM entry does not require the server integrator to assemble a public source list at all. Exposing only a compiler-owned facade is a stronger, simpler publication boundary than checking an arbitrary file list against a possibly incomplete private filename list.

## Implementation

`src/sco-selective-partition.js` now retains a process-local `WeakMap` from every `partitionScoSelectedAsyncExports` return object to a JSON snapshot of its compiler-generated partition data. `createScoSelectedHandler(partition,serverExports,options)` requires the exact in-process object, rejects modifications since generation, and constructs the HTTP handler from the snapshotted **one clientFile**. It derives the exact `publicPaths` as that generated file's path and binds RPC methods using the snapshotted method-name map and the trusted server ESM namespace. Callers cannot inject `publicPaths`, `remoteMethods` or a second `sourceFiles` entry. The generated RPC endpoint must match the selected handler's route prefix. `src/index.js` exports the new helper.

This source-publishing boundary is an opt-in alternative to direct `createScoHandler` construction. It does not need to inspect hidden dependency filenames or distinguish Windows filesystem path aliases. The provenance snapshot is held only within the trusted Node process; after verifying it, the helper uses a fresh JSON-parsed copy, so a caller changing the original public `clientFile.code` or method map cannot change what gets served. This is process-local integrity for accidentally mutable API objects, not a cryptographic defense against a compromised server.

## Reproduction contract

`test/sco-selected-handler.test.js` creates a three-file native ESM graph with private `engine.mjs` and `leaf.mjs`, compiles a mixed public/private module, verifies deployed SHA-256 source commitments, and imports the original graph on the trusted server. Its HTTP session checks:

- A generated `mixed.mjs` facade is served, while authenticated requests for both private dependencies return **404**.
- Unauthenticated RPC returns **403**, and a per-operation authorization predicate only permits the declared numeric protected method.
- Native public and private exports and the generated client ESM module match on five signed/large numeric inputs, with browser-style `fetch` rewritten to the local HTTP origin.
- Copied or modified partitions, unknown server methods, mismatched RPC endpoints, and caller-injected publication options are refused before handler construction. A getter that changes the client source during validation is also declined.

These are *test assertions* until a completed CI run confirms them. The helper neither rewrites the client facade nor changes its RPC path, so it introduces no additional remote calls. The 2.5× runtime budget still must be measured for each workload, including authorization overhead and network delay.

## Security limits

The trusted Node operator must supply the true server namespace and authentication callbacks, perform any optional source-digest verification **before** module import, and keep private source out of all other HTTP routes and static roots. Runtime imports outside the explicit manifest can still affect server behavior. Client source can be debugged and authorized requests can be relayed indefinitely. The helper does not improve generic COO/SNO program resistance, provide a tamperproof host lock against full client control, or bind authorized computation to a particular customer device.

The current outcome is an API-level prevention of one class of accidental source-file inclusion. It is narrower than the primary objective's anti-reconstruction and anti-cloning goals and remains in `im-results/`.

## Evidence links

- Source: [`src/sco-selective-partition.js`](../src/sco-selective-partition.js)
- Export: [`src/index.js`](../src/index.js)
- Native/HTTP regression: [`test/sco-selected-handler.test.js`](../test/sco-selected-handler.test.js)
- Operator guidance: [`docs/SCO_PARTITION.md`](../docs/SCO_PARTITION.md)
- Prior dynamic private import negative control: [`sims/sco-private-dynamic-loader-grid.js`](../sims/sco-private-dynamic-loader-grid.js)

**Validation pending:** The previously dispatched SCO run `44048701152` is pinned to SHA `00fc30b4` and predates this helper. It must not be cited as validation of the new code. A new exact-head runner or equivalent independent execution is required.
