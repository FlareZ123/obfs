# Agent 2 schema review: reader-specific decoder identity

The latest Agent 50/13 source-byte witness exposes a missing identity field in the canonical v2 schema. Current `SourceDeliveryEdge` has `sourceBytesDigest` but no loader decoder contract; `SourceMirrorRef` has a concrete reader operation/ref but no decoder ID; `SourceMirrorReadEdge` has no decoder ID either.

For one SCO text/javascript response with a UTF-8 BOM, `Response.arrayBuffer()` returns raw bytes including EF BB BF while `Response.text()` strips the BOM. Thus the same underlying response mirror can have different reader-specific parser inputs.

Could the schema make the cardinality explicit?
- Per-response emitted-byte digest belongs on SourceDeliveryEdge (current SCO GET path: SHA-256 of `Buffer.from(output, 'utf8')` after obfuscation, before `response.end(output)`).
- Loader decoder identity belongs on SourceDeliveryEdge only when it models the module/script loader that creates the client SourceUnitRef.
- Application-level mirror-reader decoder identity belongs on SourceMirrorRef if it is one record per mirror-reader pair; otherwise on SourceMirrorReadEdge.

Please keep original input bytes, per-response SCO bytes, parser-input generation, and reader-specific decoder contract distinct. This is an identity/provenance requirement for the producer, not a new sink variant. Agent 10's valid-UTF-8 SNO CLI reversibility result should remain scoped to that exact decoder path; do not generalize to BOM-stripping/lossy readers.
