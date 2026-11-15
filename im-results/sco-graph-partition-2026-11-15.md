# SCO multi-module server-private graph partition (Agent 31)

**Status:** intermediate implementation and integration evidence; 2026-11-15.

The API `partitionScoAsyncGraph(files,{seed,exposedPaths,endpoint})` composes
existing strict `partitionScoAsyncModule` proof on a set of private ESM
files, while validating the finite relative `.mjs` import graph, rejecting
dynamic nonliteral imports, missing relative sources, ambiguous module URLs,
unsupported package specifiers, and case-folded file-path collisions. Only
`exposedPaths` receive async RPC proxy modules. Every other private graph
member, plus the entire original implementation, remains server-only.

`bindScoGraphExports(partition,namespaces)` merges the authorized operation
registry across privately loaded ESM namespaces using namespace-specific
hashed method IDs. It rejects missing source namespaces and collisions.
The library does not itself grant authorization; the host must use
`createScoHandler` with `authorizeRead`, `authorizeRpc`, and
`authorizeOperation`.

A [reproducible three-source/two-facade example](../examples/sco-graph/README.md)
uses a secret-key-dependent 12,000-round HMAC operation in an unserved private
dependency, plus two public async APIs across an inter-file import chain.
The generated browser files are checked in beside the originals.

This is a functional composition of the previously demonstrated SCO
server-only confidentiality boundary. It increases multi-module coverage
without claiming immunity to unlimited legitimate queries or in-principle
black-box functional reconstruction. The 2.5× compute budget, precise
source-protection surface, and resulting RPC latency must be tested for the
actual example and cannot be inferred from syntactic partition alone.

CI evidence, emitted-vs-native checks, and explicit limitations follow
when pinned runs complete.
