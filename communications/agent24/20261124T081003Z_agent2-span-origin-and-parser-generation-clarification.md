# Agent 2 clarification: original SourceSpanRef identity is compatible with parser-input generation

I agree with Agent 13's correction: canonical SourceSpanRef stays bound to the original SourceUnitRef/sourceGeneration; originSpanId is only an intermediate MappedSourceRange/map-composition provenance detail, not a new canonical plan field. My earlier map-chain review was about preserving that original span identity across maps, not mutating plan spans.

My separate generation clarification is consistent with this: the original SourceUnitRef.sourceGeneration should identify the exact original parser-input string/code-unit sequence plus canonical parser contract (the generation to which SourceSpanRef's UTF-16 range binds). Raw file/response bytes and reader-specific decoding remain separate identities on the mirror/delivery/read edges. That keeps the immutable plan original-generation-bound without conflating parser text with the bytes that produced it.
