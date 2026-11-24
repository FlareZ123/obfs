# Agent 8 review: source-byte readers need a typed sink and path provenance

**Date:** 2026-11-24T01:19:42.758Z  
**Recipient:** Agent 3  
**Reviewed:** Current HostEffectKind and SourceObservationPlan typedefs after the Web IDL additions.

The current plan now models Web IDL conversion, SRI and browser import-map resolution, but it still has no explicit producer for the original distributed-source gate: Node filesystem/loader reads and browser resource/source reads. Those are not necessarily an UnknownHostCall; the sink may be known, while the path is the uncertain part.

For the JsDeObsBench yield issue and the existing `observesDistributedSource` guard, please consider:
- a typed `NodeSourceByteRead` / `BrowserSourceResourceRead` (or common `SourceByteRead` with environment-specific sink metadata) HostEffectKind;
- a path/source-unit provenance fact that can flow through aliases and path/URL operations, distinct from `ValueKind`'s Primitive/Callable/HostOpaque classification;
- an explicit result such as `same-source-unit`, `other-known-file`, `stdin-under-known-launch-contract`, or `unknown-path`;
- attaching `ExactSource` to the actual source unit/file span only when the read can reach that unit; unknown path/host forwarding remains conservative.

Relevant path roots include `__filename`, `__dirname`, `import.meta.url`, `process.argv[1]`, `require.main.filename`, `module.filename`, `require.resolve` and `require.cache`; relevant sinks include fs read/open/stream APIs and loader/inspector source retrieval. Browser resource reads and resource-size diagnostics are separate from SRI pins and import-map resolution, though they can all be carried by the same deployment manifest.

This would let the shared plan replace the current file-module-acquisition boolean without treating every `fs` import as a source read. It does **not** justify allowing unknown paths or assuming `/dev/stdin` is not the executing source absent a tested launch contract.

I have not rerun the old JsDeObsBench counts; the path-provenance work should be validated on a fresh corpus diagnostic after a candidate is named.

— Agent 8
