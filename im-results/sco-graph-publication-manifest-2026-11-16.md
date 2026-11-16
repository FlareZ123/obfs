# Auto-attached private dependency manifest for SCO graph facades

**Status:** intermediate implementation and source-publication failure reproduction, limited to explicit closed private ESM graphs. **Exact tested source:** 7b2753378555859b46112cce112a4906da735057. **Validation:** [two-platform manual SCO graph run 43807583587](https://github.com/FlareZ123/obfs/actions/runs/43807583587), six Node.js tests passing each on Ubuntu and Windows Node 22, zero failures, strict SCO graph JSDoc check passing.

## Defect and failure mode

The existing partitionScoAsyncGraph API already determined which original modules were private: graph.privatePaths returned every input graph file except explicit public exposedPaths. Yet graph.clientFiles, the generated public RPC facades supplied to createScoHandler, did not carry this information. The SCO handler supported a privateModulePaths provenance marker and explicitly rejected co-publication of marked modules. A graph integrator who accidentally passed an extra original private file alongside its generated facade therefore bypassed that existing prevention rule. The handler served the private file in the exact SCO route namespace.

The new [real HTTP negative control](../test/sco-graph-private-path-policy.test.js) intentionally strips the provenance marker from two facades, exactly modeling the earlier returned facade structure, then configures createScoHandler with a third original server-only module. An unauthenticated GET of /obfs/secret.mjs succeeds with HTTP 200 and includes the deliberately planted SERVER_PRIVATE_GRAPH_CANARY_78341 comment. This is a reproducible accidental-publication failure, not evidence of a remote attacker escaping a correctly configured source allowlist.

## Repair

In [src/sco-graph.js](../src/sco-graph.js), after computing the closed graph's privatePaths, each generated facade now receives a fresh array snapshot as clientFile.privateModulePaths. It remains server-side metadata, separate from the generated JavaScript code sent to clients. The existing handler uses these markers in its pre-route forbidden-path scan and refuses to construct any handler that co-serves those private source files, irrespective of source file order.

The regression verifies both orderings, selection of individual facades, the generated two-facade group, a graph with an empty private path set, and the original HTTP leak as a negative control. With the marker present, passing the original private dependency fails immediately with a TypeError, so there is no GET route to attack. A manually constructed handler using unrelated arbitrary source files without this marker retains its previous legacy behavior.

| Condition | Observed outcome |
| --- | --- |
| Original private module in explicitly exposed graph | marked private and omitted from generated JS |
| Facade stripped of privateModulePaths, extra original module added | handler accepts, GET /obfs/secret.mjs returns HTTP 200 and source canary |
| Generated facade with privateModulePaths, extra original module added | constructor rejects before serving |
| Private module listed before generated facade | constructor rejects |
| Just the generated public facades | handler construction succeeds |
| Graph whose inputs are all explicitly exposed | no private paths, handler construction succeeds |

This is a narrow build/deployment safety improvement. It does not encrypt source, prevent relaying legitimate RPC, detect clients instrumenting public code, authenticate requests, or defeat a malicious operator who intentionally removes privateModulePaths. The independent positive publicPaths allowlist is still recommended because it also detects accidental extra files with different names.

## Reproducibility and evidence limitations

The tested graph uses two generated exported async facades with one private dependency. Full integration in the same manually dispatched workflow verifies the original three-module HMAC/private-source example, exact generated facades, native-versus-remote results and strict JSDoc. Source-leak and constructor-rejection assertions run locally inside real Node HTTP without production network/TLS/authentication. No 2.5x performance certification or hostile-server resistance follows. The metadata preparation adds one O(number-of-facades × private-files) construction-time array copy and no new per-RPC computation. Its practical memory cost depends on graph size.

The relevant changed source is src/sco-graph.js, test/sco-graph-private-path-policy.test.js, and the existing .github/workflows/manual-sco-graph.yml. No new workflow or production RPC operation was added.


## Addendum: block byte-exact source aliases, including originals of exposed modules (Agent 31, 2026-11-16)

**Pinned test source:** `c893a84ecbf7c5e0c8f651a3ff0213f28a428593`.
**Targeted evidence:** [manual SCO graph Linux/Windows Node 22 run 43854468508](https://github.com/FlareZ123/obfs/actions/runs/43854468508): 7/7 Node tests passed on each OS, deterministic generated client facades checked, and strict graph JSDoc passed. This builds on the earlier private-path test at `7b27533`, preserving its historical scope.

The prior private-path metadata rejected accidental publication of an unchanged `secret.mjs` at the original path. However, an unchanged source copy named `shadow.mjs` had no forbidden path, and the original `api.mjs` was excluded from `privatePaths` because that path was intentionally used by its generated public facade. Both could be accidentally served from a handler that included a different legitimate generated facade. They are distinct deployment mistakes that the pathname-only rule did not address.

`partitionScoAsyncGraph` now adds a `privateOriginalDigests` metadata array to **each** public facade. It contains SHA-256 fingerprints of the UTF-8 source bytes of **all** original graph inputs, including originals of explicitly exposed modules. `createScoHandler` validates the fingerprints and hashes each candidate served source at handler construction. An identical original source at its own path or under an alias is rejected before creating any HTTP route. The published JavaScript contains neither these digests nor the original source. Generated public facades remain admitted.

The added [real HTTP regression](../test/sco-graph-private-path-policy.test.js) demonstrates that keeping the private-path marker while stripping only `privateOriginalDigests` allows `/obfs/shadow.mjs` to return HTTP 200 with the original `SERVER_PRIVATE_GRAPH_CANARY_78341` text. With metadata intact, `createScoHandler` instead refuses the same exact source copy. A second assertion rejects original `api.mjs` when the generated `audit.mjs` is also present. Another assertion deliberately changes a source byte and confirms the fingerprint guard does not detect it.

This is source-publication hygiene under a trusted integrator, with no claim of adversarial source confidentiality. Source changes, a removed marker, intentionally reapproved filenames and separately configured HTTP servers remain outside its enforcement. For that reason, an independently reviewed `publicPaths` allowlist continues to be recommended. Work is one SHA-256 digest per original graph module at partition time, one list copy per facade, and one digest per candidate file when the handler is created; the request-time RPC hot path is unchanged. No general performance bound is established by this startup-only test.

The earlier section's statement that the **pathname marker** alone cannot detect arbitrary aliases remains historically correct. The new byte-fingerprint guard closes the specific exact-copy alias case while preserving that limitation for modified content.
