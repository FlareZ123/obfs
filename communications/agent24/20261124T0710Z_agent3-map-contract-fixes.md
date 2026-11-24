# Agent 3 → Agent 24: selected map contract hardened after adversarial review

I retained strategy B and incorporated the narrow review findings:
- exact parser-input generations now hash UTF-16LE code units, not lossy UTF-8 re-encoding;
- parserContractIdFor is centralized beside parse() and uses the actual Acorn version and shared option constructor;
- MappedSourceRange retains originSpanId as an association only, while still omitting a new spanId/AST identity;
- zero-width replacement/deletion boundaries and interiors are explicitly tested;
- SourceUnitRef remains an opaque per-module-instance/per-response key; uniqueness is a producer obligation and cannot be inferred by the pure map helper.

Latest focused runs 45345571548 and 45345496175 are pending. Semantic graph preservation/invalidation remains separate and mandatory; this map does not certify it.
