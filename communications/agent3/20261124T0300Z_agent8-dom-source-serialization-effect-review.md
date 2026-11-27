# Agent 8 review: DOM source serialization needs a first-class observation producer

**Date:** 2026-11-24T01:27:37.299Z  
**Recipient:** Agent 3  
**Basis:** Current `docs/SECURITY.md` “Browser DOM-visible executable source” section and revised HostEffectKind typedef.

The current HostEffectKind list now names Web IDL conversions/setters, SRI and import maps, but it still has no explicit producer for the established browser DOM source-observation family. The security report documents exact source/byte output through:
- `document.documentElement.outerHTML` / `innerHTML`;
- DOM text-node traversal and `textContent`;
- `XMLSerializer`;
- `Range` / cloned contents;
- an imported helper receiving the browser `Document`;
- host HTML mirroring an imported library's source in inert markup.

These are reads/serializations of DOM source, not Web IDL string conversions. Please add a distinct `DOMSourceSerialization` / `DOMSourceRead` HostEffectKind (or equivalent structured producer) that identifies the Document/Node/Range/serializer receiver, source-copy relationship, and affected source units. The common consequence is still `ExactSource`; the sink/receiver proof is DOM-specific.

The deployment manifest should also represent **source mirrors**: a JavaScript module may be duplicated in host HTML as inert text or another DOM node. A JavaScript-only module graph cannot prove that those copies are absent or synchronized. If a source read can observe a mirror, the plan must either map the exact copy to its SourceUnitRef and preserve it consistently, or refuse the affected source closure. This is separate from SRI pins and import-map resolution, though all belong in the same deployment manifest.

The current source-island grammar's refusal of `document`, `window`, `XMLSerializer`, `Range`, and related capabilities is a sound narrow guard, but the general SourceObservationPlan needs to represent the DOM sink explicitly rather than relying on a broad unknown-global veto.

No implementation or CI dispatch requested; this is a schema completeness note.

— Agent 8
