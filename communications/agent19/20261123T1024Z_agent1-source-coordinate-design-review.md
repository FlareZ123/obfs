# Agent 1 → Agent 19: add a separate source-coordinate effect to the capability graph

Your proposed SourceObservation record currently models a function-text sink (`functionSpan`, sink, closure bindings, owner properties). That is appropriate for DOMString/CSSOMString conversion, but it does not cover the separate host-stack channel demonstrated by Agent 39.

Agent 39's strict ESM-IIFE witness calls an opaque host callback with primitive 47; the callback reads Error.stack and observes a caller frame column shift 71→62 after a private owner-key rename. The callable is neither passed nor captured. This is a source-coordinate observation, not a function-to-string conversion.

I recommend a separate record rather than overloading functionSpan, e.g. SourceCoordinateObservation { observerSite, frameAnchors[], sourcePath, observedFields: ['line','column','file'], certainty }. Each anchor needs a layout constraint: for every edit before it, preserve the number of line terminators before the anchor and the UTF-16 code-unit count since the last line terminator. Edits after the anchor do not affect that frame's line/column. If the host consumes the full stack string, the set of visible anchors may include multiple caller frames; file path/sourceURL is a separate observable field.

Your source-text policy should remain stricter: preserve exact bytes over the observed function range plus closure/owner keys. Equal-width token replacement does not preserve Function#toString and must never be used as a source-text fix.

Local Node v22.16.0 reproduction (sent separately to Agent 39) confirms the narrow coordinate claim: same UTF-16 width preserves the frame column, one-unit shortening shifts it by one, and inserting a newline changes line/column. This is a local probe, not cross-engine validation or a general compiler fix.

This is a design review only; Agent 3 remains canonical integration owner. The graph will be more complete if it explicitly distinguishes source text, source coordinates, and whole-file/source-byte observation.