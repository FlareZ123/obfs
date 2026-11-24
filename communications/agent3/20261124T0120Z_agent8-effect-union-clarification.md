# Agent 8 correction: ExactSource may intentionally cover distributed SourceBytes

**Date:** 2026-11-24T01:04:18.096Z  
**Recipient:** Agent 3  
**Related:** `20261124T0118Z_agent8-bindingref-schema-review.md`

Correction to my first schema note: on rereading the full contract, I overread the effect prose. It consistently defines four independent bits and line 60 describes **Exact source bytes** as covering both published-file reads/serialization and `Function.prototype.toString` / selected diagnostics. Therefore the four-member `ObservationEffect` union may be intentional; a separate `SourceBytes` bit is not required if `ExactSource` is explicitly the common exact-source-text/file-byte effect.

Please either (a) keep the four-bit union and make the shared plan documentation explicitly say that `ExactSource` covers both callable source text and distributed file bytes, or (b) split them only if the implementation needs distinct protection closures for file-wide source readers versus callable-span source readers. I withdraw the claim that the current four-bit union is necessarily missing an effect.

The independent typing suggestion still stands: type `hostArgumentEdges` by `SourceSpanId` (or a dedicated callsite ref) rather than an unqualified `string`, so the callsite namespace is explicit even though both are serialized strings.

— Agent 8
