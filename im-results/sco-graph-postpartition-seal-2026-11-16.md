# Sealed SCO graph publication after partitioning

**Status:** intermediate, reproducible source-publication engineering result under a trusted-server integrator. **Validated source:** `31a3dbd36b352687d3c88300114ea5b10246bcdd`. **Targeted Linux/Windows Node 22 gate:** [workflow 43917301822](https://github.com/FlareZ123/obfs/actions/runs/43917301822), both jobs successful (generated facade check, graph tests, strict JSDoc). This is neither a confidentiality proof under server compromise nor an independently established obfuscation-strength improvement.

## Demonstrated failure mode before the repair

The SCO graph compiler exposes mutable `graph.clientFiles`, `graph.partitions`, and `graph.exposedPaths` to the server integrator. The composed `createScoGraphHandler` formerly passed the caller's current `clientFiles` directly to the HTTP constructor. Its exact `publicPaths` gate prevented new filenames, while `privateOriginalDigests` rejected byte-identical original code.

Those defenses did not identify a **byte-modified original private module substituted under an already approved facade pathname**. The regression `test/sco-graph-private-path-policy.test.js` installs the original private module's source plus one newline at `api.mjs`, keeps a valid second facade, and constructs a plain `createScoHandler` with exact `publicPaths: ['api.mjs','audit.mjs']`. The live GET of `/obfs/api.mjs` returns HTTP 200 with `SERVER_PRIVATE_GRAPH_CANARY_78341`. This is an accidental/mistaken handler-assembly witness; it is not a remote path traversal exploit against a correctly assembled handler.

A naive integrity comparison performed **after** constructing the handler is also insufficient. A mutable source-code getter may return different values during proof and publication. This observation motivated serving an independently retained source snapshot rather than trusting the original manifest again after validation.

## Change

`partitionScoAsyncGraph` now retains a private JSON snapshot of its compiler-generated graph in a module-local `WeakMap` keyed by the returned graph object. `createScoGraphHandler` requires that same in-process graph identity, compares the current manifest serialization against the snapshot, and creates both the RPC registry and the published source list **from a parsed copy of the snapshot**. An altered manifest is rejected before returning an HTTP handler. A copied or JSON-roundtripped manifest is rejected because it cannot inherit the private identity seal.

The original diagnostics for opt-in `routePrefix` mismatch and caller-supplied `publicPaths` / `remoteMethods` still apply to genuine generated graphs. The graph helper's intended design is an in-process partition/serve composition. Callers that need cross-process persistence should regenerate the graph on the serving process from the original trusted build inputs; they cannot deserialize an untrusted manifest into this sealed API.

## Test evidence

The targeted regression includes a real HTTP original-source disclosure negative control, positive construction and serving through the composed handler, refusal of five direct manifest mutations, and rejection of JSON-roundtripped manifests. The five mutations change generated code, private fingerprint metadata, a method ID, an exported method name, and the private path list.

A separate mutable-getter regression returns the approved generated code for the two serialization reads and would return the private original on later reads. The composed handler serves the original approved public facade and never asks the mutable getter for a third value. Thus a getter that masks its change during the comparison cannot induce source publication from that changed property.

The **initial** implementation and test at SHA `438ee26133948e1aae1fb7ebabbcabda1d8547d7` failed the [first Linux/Windows workflow 43916734848](https://github.com/FlareZ123/obfs/actions/runs/43916734848) on an assertion's expected exception text: a mutated method-name list failed earlier when the existing registry binder could not find the named export. The revised code uses the private snapshot as the served source of truth, and the tests now check that stronger property. The later run `43917301822` passed all targeted stages on both platforms.

## Boundaries

This mechanism protects the **composed helper** from accidental post-partition mutation and a narrowly constructed getter swap. It does not prevent a trusted integrator from explicitly bypassing the composed helper, serving unrelated handlers, replacing the library or changing trusted server functions. Calling `createScoHandler` directly with a byte-modified private original still permits the tested disclosure, as intended by the regression's negative control. The design cannot prove that a syntactically distinct facade or authorized RPC operation is safe. Client instrumentation, online authorized relaying and RPC authorization are independent threat surfaces.

Snapshot serialization and comparison occur only at graph generation and handler construction, before client RPC execution. No new per-request work was added. The target workflow did not benchmark construction latency, production network latency or the 2.5× whole-application budget. The effect on real deployments should be evaluated with the complete application and its authentication/transport path.

**Files:** [implementation](../src/sco-graph.js), [real HTTP and mutation tests](../test/sco-graph-private-path-policy.test.js), [workflow](../.github/workflows/manual-sco-graph.yml).
