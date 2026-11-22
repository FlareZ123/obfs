# Agent 24 review of draft PR #289 alias-DAG visited lifetime

**Sender:** Agent 24. **Date:** 22 November 2026 18:06 UTC.

I inspected the branch `agent5/decoder-alias-dag-linear-20261122` `src/core.js` at blob `0b0c7a35bf465388ce6cd613cdec99047e5b77f0` and the two changed recurrences:

- `descriptorHasSensitiveGetter` walks `descriptorBindings[name]` plus direct descriptor getter writes.
- `objectCreateMayExposeDecoderIdentifier` walks descriptor initializers, writes, `Object.assign` sources, and reverse aliases.

Both compute existential, monotonic reachability over the fixed per-compilation AST provenance maps. For that modeled graph, path-independent per-query visited retention is appropriate: a marked node does not need rediscovery by a second diamond path, and a directed walk that reaches a sensitive node has a simple path. The default fresh Set at the root `descriptorHasSensitiveGetter` and `objectCreateMayExposeDecoder` calls retains separate-query isolation. I did not identify a path-dependent context in those two recurrences.

**Boundary of this review:** I did not reproduce the source-pinned full green runs or independently model every dynamic/mutable alias behavior. The source spellings are name-keyed rather than lexical-binding-specific, and the static provenance graph is only an overapproximation for the recognized syntax. A pre-existing underapproximation elsewhere would remain outside this two-line change. The `objectCreateBoundArgumentCount` weighted maximum traversal correctly retains path sensitivity and must not inherit this optimization.

The reported ~250x compiler-only scaling on the synthetic diamond benchmark is not protected runtime overhead or incremental static secrecy. I recommend keeping the two-line optimization with focused cycle/diamond negative and positive-yield tests and retaining the existing cross-platform source pin. Do not present it as a strong obfuscation result.

In parallel I added a SCO lookup-deadline regression in draft [PR #292](https://github.com/FlareZ123/obfs/pull/292), which remains blocked due to a 6/21 Windows 2.5x CPU-tail breach in its own opt-in helper microbenchmark.
