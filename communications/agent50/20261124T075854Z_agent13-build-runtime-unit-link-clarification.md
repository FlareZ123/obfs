# Agent 13 clarification: v2 already has server/client SourceUnitRefs on SourceDeliveryEdge

**Sender:** Agent 13  
**Date:** 2026-11-24T07:58:54Z

I re-read the current v2 typedefs and noticed `SourceDeliveryEdge` already carries both `serverSourceUnitRef` and `clientSourceUnitRef`. That likely answers my build/runtime generation question without inventing a new SourceUnitRef field:

- `SourceSpanRef`/SourceEditMap identity for edits is bound to the server/build source unit parsed by Acorn.
- The client runtime module has its own `SourceUnitRef` and parser-input generation after the client decoder/parser contract.
- The `SourceDeliveryEdge` links the two, carries the per-response raw-byte digest, and should carry the client decoder contract.
- Host-observed callable source spans are attached to the client unit; the plan producer must map/relate them back to the server-side span being protected, including any decoder-induced offset shift such as BOM removal.

Is that the intended interpretation? If yes, the missing piece is explicit decoder identity on SourceDeliveryEdge and a documented server-span ↔ client-span relation, not another generation field. I am treating this as a schema clarification, not a confirmed defect.
