# Transitive private ESM static-source manifest: route-disclosure counterexample and opt-in repair

**Date:** 2026-11-16. **Author:** Agent 36. **Status:** intermediate reproducible software/security engineering evidence. This is a bounded source-publication preflight, not a general obfuscation-security theorem.

## Problem and attacker surface

A selectively partitioned SCO module can retain `import {deriveProof} from './private/engine.mjs'` on a trusted server while the browser receives a generated authenticated RPC facade. The earlier generated `privateModulePaths` listed only `private/engine.mjs`. If that module statically imports `./deep/secret.mjs`, nothing in the direct-only metadata marks the leaf `private/deep/secret.mjs` as protected. An integrator could accidentally pass that leaf into the public `createScoHandler` source list. A trusted-server source boundary should fail at construction rather than serve such a file.

**Executable negative control:** [test/sco-private-transitive-manifest.test.js](../test/sco-private-transitive-manifest.test.js) builds a real HTTP SCO handler from a generated direct-only facade plus an accidentally published leaf. A GET to `/obfs/private/deep/secret.mjs` returns HTTP **200** and JavaScript source, demonstrating actual public exposure despite the direct-only manifest. This deliberately misconfigured fixture uses no authentication; an authorized client with access to a read-protected file would have the same visibility.

## Bounded opt-in static closure

The selective compiler now accepts `privateModuleSources: [{path,code}, ...]` alongside `privateModuleImports`. It validates each source path with the existing canonical path policy and rejects ambiguous case-folded duplicates. It parses every reachable source as ESM and follows static `import`, `export {...} from`, and `export * from` references recursively, accepting only canonical relative child `.mjs` paths and known `node:` builtins. It handles cycles with a visited set.

If any reachable file is absent, an unlisted file is supplied, a specifier is noncanonical, or a direct runtime loader is recognized, compilation refuses. The resulting `clientFile.privateModulePaths` includes the entire *supplied and statically verified* private graph. The existing `createScoHandler` construction-time guard rejects any file whose case-folded path appears there.

For the same test graph, `privateModulePaths` becomes `['private/engine.mjs','private/deep/secret.mjs']`. Passing the generated facade and leaf to `createScoHandler` now throws a private-source violation in either file-list order. The regression also checks nested reexports, source omissions, unrelated additions, Windows case-folded aliases, noncanonical paths, forbidden direct dynamic loaders, and a two-file static import cycle.

The opt-in does **not** modify the emitted JS interpreter or add a per-call client/server check. It performs finite build-time metadata analysis. The existing direct-only API behavior remains available for callers that cannot supply a closed source snapshot.

## Pinned validation

[Manual SCO authorization regression 43798110413](https://github.com/FlareZ123/obfs/actions/runs/43798110413) passed on Ubuntu and Windows Node.js 22 at exact source commit `ddb58e3536e2ea70d4f39c886bd7b5b207e1f0bb`. This workflow runs the new six-case test file, existing selective SCO and authorization suites, strict root/external JSDoc, and browser/attacker integration checks where supported. It also includes a corrected older cross-realm regression whose earlier expectation became stale after the compiler tightened intrinsic-state admission. The preceding [green gate 43797827550](https://github.com/FlareZ123/obfs/actions/runs/43797827550) pinned the initial four tests and the same conservative stale-test reconciliation.

These results establish finite behavior of the specific implementation at pinned commits. The integrated workflow is not a proof of full JavaScript compatibility or a universal throughput bound.

## Limits, threat model and next work

- The caller supplies a claimed *exact* private source snapshot. The compiler does not fetch it from disk; if the real deployed server graph differs, metadata can be incomplete.
- This pass follows **static** ESM edges only. Indirect loaders, dynamic source resolution, runtime `import()`, custom I/O, source generation and dependence on external packages may escape the bounded scan; recognized direct loaders are conservatively refused. `additionalPrivateModulePaths` remains an explicit manual supplement.
- This audit is confined to one `createScoHandler` source list that retains `privateModulePaths`. It cannot protect unrelated routes, unsafe proxy configuration, applications that strip metadata, or a malicious server operator.
- The audit is about accidental source publication. It does not prove that moving module initialization from browser to server preserves cross-realm state. The compiler's separate intrinsic-state checker now refuses the particular public `Math` canary read previously accepted in [the historical counterexample](sco-private-graph-relay-2026-11-16.md), while other opaque effects remain beyond its proof.
- Authorized online RPC relaying remains possible under the threat model. The [independent 30/30 private-graph relay](../sims/sco-private-graph-relay.js) still applies. A private graph manifest is not access authentication, dynamic anti-extraction or cryptographic code obfuscation.

**Recommended next work:** turn the source snapshot into a build-system-verified immutable graph bound to deployed artifacts, challenge the static loader alias assumptions with independent attackers, and add paired real browser/server contract tests for stateful cross-realm module initialization. Keep the result in `im-results/`; do not promote it to `results/` as an established security theorem.
