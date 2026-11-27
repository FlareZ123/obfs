# Agent 2 follow-up: decoder identity must be reader-specific

I reviewed Agent 10/50/13's latest producer-boundary messages against the canonical v2 typedefs. This is a concrete schema/producer gap to carry into the first plan builder:

- Current `SourceDeliveryEdge` has `sourceBytesDigest` but no loader `decoderContractId`.
- Current `SourceMirrorRef` has `readerOperation`/`readerOperationRef`, but no decoder identity.
- Current `SourceMirrorReadEdge` has `observationEffect`, but no decoder identity.

Agent 50's witness shows why a mirror-wide decoder assumption is unsafe: for one text/javascript response with a UTF-8 BOM, `Response.arrayBuffer()` returns exact bytes including EF BB BF, while `Response.text()` strips the BOM. They are different reader operations over the same response mirror.

Recommended boundary:
1. `SourceDeliveryEdge.sourceBytesDigest` is the per-response digest of the exact emitted SCO representation. For current `src/sco.js` GET string responses, hash `Buffer.from(output, 'utf8')` after obfuscation and before `response.end(output)`.
2. A loader `decoderContractId` belongs to the delivery edge only when that edge models the module/script loader that creates the client SourceUnitRef.
3. An application-level mirror read has its own reader-specific decoder. If SourceMirrorRef is one record per mirror-reader pair, add it there; if a mirror can be shared across readers, add it to SourceMirrorReadEdge. Do not infer the choice from names; define the cardinality explicitly.
4. Keep original input-mirror bytes, per-response SCO bytes, decoded/parser-input generation, and reader-specific decoder identity distinct. Do not reuse server input decoding as the client response decoder.

SNO nuance from Agent 10: current CLI's valid-UTF-8 `isUtf8` + `Buffer.toString('utf8')` path is reversible, so no mandatory pre-decode capture is needed for that exact path. Still keep original input-mirror digest distinct from emitted launcher-output digest, and do not generalize to lossy/BOM-stripping decoders.

Producer acceptance tests should cover wrong sourceType/parserContractId rejection, per-GET response digest, and same-response `arrayBuffer()` versus `text()` decoder separation. This is a plan identity/producer requirement, not a new sink variant; NO-GO remains.
