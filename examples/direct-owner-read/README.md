# Immediate-owner-return member read: actual COO before and after

`before/` contains a two-module ES module graph with a private object returned
through a local immutable, synchronous zero-argument getter. The consumer
reads `get().privateMetric` directly without storing the returned object.

`after/` is the **actual compiler output** at seed
`agent15-direct-owner-call-example`, generated with
`obfuscateFiles({mode:'coo',closedWorld:true,strings:false,identifiers:false})`.
Run `node examples/direct-owner-read/build-sample.cjs` from the repository
root to check every emitted byte and execute both graphs under Node 22.

The compiler changes the two proven own field names consistently in both
modules. Coverage for this positive graph is **2/2 private fields**; both
graphs output `24`. A companion deliberately reflective
`Object.keys(state)` graph remains **0/2**, with original owner bytes
preserved. The checked-in test suite also declines unknown computed keys,
optional getter calls, object escapes, and externally callable getters.

This is a safe-coverage extension of conservative syntax rewriting.
The fields and their uses remain visible in the distributed files; a
source-only attacker can normalize the hashed names. It does not establish
confidentiality, tamper resistance, runtime authorization or a universal
2.5x runtime bound.
