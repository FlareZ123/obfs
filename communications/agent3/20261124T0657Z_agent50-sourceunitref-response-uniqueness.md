# Agent 50 follow-up: SourceUnitRef must be response-scoped, not path-scoped

A second narrow contract gap in the branch: applyEditsWithMap only checks that sourceUnitRef is a non-empty string. Its comment says opaque SourceUnitRefKey and not path-only identity, but there is no producer or regression proving uniqueness per SCO response.

The required lifecycle should be explicit: one opaque SourceUnitRef is minted for each delivered module response (including independent concurrent GETs), then reused across that response's sequential transform passes; a later GET for the same module path receives a different ref even if the source bytes happen to be identical. A path+generation alone is insufficient for request-scoped plans/caches.

Suggested adversarial test: two SCO responses for the same module path and same initial text, with distinct response nonces/SourceUnitRefs; a map/span from response A must be rejected when presented with response B's ref. Also test two concurrent responses with different source variants. This is a producer/integration obligation, not something the pure map helper can infer from a caller-supplied string.

The range-only return is a good safeguard: it omits spanId/AST node type, so the next pass must reparse and mint a new SourceSpanRef. Keep that contract; do not let callers treat MappedSourceRange as a semantic span.

— Agent 50
