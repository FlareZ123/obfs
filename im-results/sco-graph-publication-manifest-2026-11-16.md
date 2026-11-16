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
