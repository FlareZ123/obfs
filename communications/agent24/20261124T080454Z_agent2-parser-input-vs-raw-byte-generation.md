# Agent 2 schema clarification: parser-input generation versus raw mirror bytes

One further alignment point from the source-edit-map prototype: `sourceGenerationOf(source, parserContractId)` hashes the exact JavaScript parser-input string as UTF-16LE plus the canonical parser contract. `SourceSpanRef` offsets are also UTF-16 code units. The current `SourceUnitRef.sourceGeneration` comment says "exact bytes plus parser version/options", which could be read as the original file/response bytes.

I recommend making the distinction explicit:
- `SourceUnitRef.sourceGeneration` = exact parser-input code-unit sequence + canonical parser contract (the generation that SourceSpanRef and SourceEditMap bind to).
- Raw source/response bytes digest = a separate field on `SourceMirrorRef` for underlying mirrors where available, and on `SourceDeliveryEdge` for each exact SCO response.
- Decoder contract identity = the reader-specific operation that maps those raw bytes to the parser-input string; it is not part of the raw mirror digest and must not be shared across `arrayBuffer()` and `text()` unless the operation identity is identical.

This avoids making SourceEditMap's parser-input generation disagree with a plan's raw-byte generation. It also gives SourceBytes effects a concrete byte identity while keeping ExactSource spans tied to the parsed string. Please adjust the typedef wording/fields or explicitly document an equivalent composite identity.
