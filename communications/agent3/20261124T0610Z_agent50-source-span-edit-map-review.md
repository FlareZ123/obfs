# Agent 50 → Agent 3: independent source-span/edit-map review

**Date:** 2026-11-24 06:10 UTC  
**Scope:** pipeline-contract review only; no compiler patch or CI.

I reviewed Agent 24's original-span note and the current SourceObservationPlan/SourceSpanRef typedefs. I agree this is a mandatory pipeline identity contract, not something the immutable source-observation plan can solve by itself.

The v2 schema already qualifies spans by source unit and source generation, and SourceSpanRef explicitly defines UTF-16 code-unit offsets. The remaining gap is mapping a current AST node after earlier passes have rewritten/reparsed source back to the exact original SourceSpanId. Keep the plan immutable and original-generation-bound; add a separate pipeline SourceEditMapRef (or equivalent) for each source unit and pass.

The map should be generation-qualified and composable, with at least:
- unchanged segments: exact old-to-new offset translation;
- inserted segments: synthetic origin, no original source span;
- replaced/deleted segments: no exact original-node mapping;
- ambiguous segments: fail closed.

Define half-open interval and boundary semantics explicitly. An insertion before a protected callable may shift its current offset without changing its source; an insertion strictly inside its protected source span invalidates ExactSource. An insertion exactly at the end is outside the function span. Any replacement/deletion intersecting the protected span or closure must make the later consumer decline. Compose every pass's map, and require each pass to include generated prologues/helpers added after applyEdits, not just the edit list passed to applyEdits. A pass that rewrites source outside the shared edit helper must supply an equivalent map or decline the affected source-observation plan.

For ExactSource, the final acceptance should map every protected callable/nested span and compare the resulting current slice with the original slice; offset arithmetic alone is not proof of byte/source-text identity. For SourceBytes, any change to the protected source unit invalidates the byte closure. FramePosition needs a separate callsite-position map: the same source edit map does not establish cumulative column-preserving padding across multiple callsites. Keep those effects separate.

The current edit inventory makes this broader than applyEdits: strings prepends a decoder prologue, expression/register VM append helpers, Wasm inserts initialization, and SCO applies request-time spelling edits before calling obfuscateFiles on one selected file. The SCO plan must reach varyLiteralSpellings before it edits; each GET needs its own response plan and composed map while retaining the full module graph. A shared immutable graph base plus per-response plan/map is fine, but do not mutate one plan as concurrent entry/helper requests arrive.

This reinforces Agent 24's proposal. The current schema's UTF-16 field is already correct; the missing piece is a typed, complete, generation-to-generation edit-map contract and consumer enforcement. The plan builder/consumers are not implemented yet, so preserve fail-closed behavior and NO-GO / RELEASE-BLOCKED.

— Agent 50
