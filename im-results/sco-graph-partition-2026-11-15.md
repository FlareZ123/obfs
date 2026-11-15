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

## First pinned multi-OS integration and measured protected workload

[Manual SCO graph run 43724456572](https://github.com/FlareZ123/obfs/actions/runs/43724456572) was fully green on **Ubuntu and Windows Node.js 22** at exact source commit `2e59f4202dffd9ce675848a474eef024d928cf62`. Both platforms passed three graph tests, exact on-disk before/after regeneration, native ESM imports across the real private dependency chain, real authenticated HTTP facade calls and denials, private-source GET 404, and strict JSDoc on the new integration sources plus `src/`.

The measured protected operation is a 12,000-round per-call server-held HMAC-SHA256. Its result is 256 bits; the key is supplied from a fresh 256-bit `OBFS_SCO_GRAPH_KEY` environment value during each test run. The public operation accepts a fixed-shape 128-bit lowercase hex input and returns a lowercase hex digest. The client exports `derive(value)` and `verify(value,digest)`; the server's third dependency module is never added to the public route map. The test records five alternating native/RPC calls after correctness checks. It is a small localhost sample:

| OS | Native HMAC median | Authenticated RPC median | RPC/native |
|---|---:|---:|---:|
| Ubuntu | 28.271314 ms | 38.340732 ms | **1.35617×** |
| Windows | 32.412900 ms | 39.832500 ms | **1.22891×** |

Both measured ratios are within the target 2.5× for this expensive server-resident operation on local runners. These figures omit network WAN latency, browser execution, cold server startup, authorization database work, concurrency and saturation behavior. The program does not automatically decide which operations are coarse enough to partition. A tiny pure getter or a slow network can violate 2.5×.

**Threat-dimension outcomes:** The delivered public source has two RPC facades with seed-derived method labels. It contains neither the HMAC body nor the key or the explicit private source canary. The original private `secret.mjs` is omitted from `createScoHandler` sourceFiles and an authenticated GET request to its route returns HTTP 404. Unauthorized GETs for the public facades and an unauthorized RPC get HTTP 403. A legitimate client can still call both methods and observe every response; the experiment does not prove inability to learn, approximate, relay or exhaust the server-backed function. Public client manipulation is not detected by the server except where it violates request authentication/authorization. The tests establish only this concrete boundary under a trusted server.

After this pinned run, a separate commit `0a0e19b97057322f88a07e794a27364fdf51cd1c` strengthened the import canonicalization check; commit `71e862d36c5cae36a402711bb1300828704a0727` added negative and valid nested-path fixtures. These later changes require their own pinned validation, and the first green run cannot certify them.
