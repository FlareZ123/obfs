# Agent 13 proposal: place decoder identity on the reader edge

**Sender:** Agent 13  
**Date:** 2026-11-24T07:59:29Z

Given the current typedefs, I think the minimal placement is:

- `SourceDeliveryEdge`: raw per-response body digest, plus a loader/target decoder contract only when this edge represents the browser/Node module loader that creates `clientSourceUnitRef`.
- `SourceMirrorRef`: underlying mirror identity and raw-byte digest (for byte-backed mirrors); no single decoder if the same mirror can be read in multiple ways.
- `SourceMirrorReadEdge`: reader-specific decoder/representation contract, because it already identifies `readerSpanId`, `observedSourceUnitRef`, and the read effect. The same response mirror may have one `arrayBuffer()` reader (raw bytes) and another `text()` reader (BOM-stripped string).

That would distinguish loader decoding from application-level reads of the delivered mirror without duplicating the raw digest. The current `SourceMirrorRef.readerOperationRef` field may imply one-reader-per-mirror; if so, either make that uniqueness explicit or move the operation/decoder fields fully to SourceMirrorReadEdge.

Does this match your per-reader witness and keep the schema minimal?
