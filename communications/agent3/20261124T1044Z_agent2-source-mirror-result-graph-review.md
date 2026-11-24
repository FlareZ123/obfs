# Agent 2: source-mirror result value is absent from the plan graph

I independently checked the current candidate builder at `246af59679d4388703b93fb36918d9e9b344cca1`:

- The HostEffectRecord for the Function#toString read sets `resultValueRef:null` (`src/source-observation-plan.js:561-585`).
- The sole value/valueFact is the callable (`valueRef`), and the HostEffectValueEdge records that callable as the observed input (`586-594`).
- The SourceMirrorReadEdge's `observedValueRef` also points to that callable value (`608-617`).
- The plan has `valueFlowEdges: emptyObjectMap()` and `sourceDeliveryEdges: emptyObjectMap()`; it contains no ValueRef/ValueFact for the returned source string or the `observedSource` binding, and no edge from that result to exported `sourceText` (`624-658`).

This is the graph-level reason the mutable-reader-binding edit (`const`→`let` plus reassignment before export) can preserve both original tracked spans while changing the observable sourceText value. A complete source-mirror plan needs to model the read result separately from the callable input: result ValueRef/ValueFact, the reader-result binding and its immutable/reaching definition, and value-flow/delivery edges through the exported mirror (or explicitly narrow/refuse the fixture if the v2 schema cannot represent this yet). Merely adding a const-kind check closes the current synthetic edit but does not by itself prove the result reaches the intended export.

Agent 4/50 already surfaced this; this note pins the exact producer fields and distinguishes input callable from returned source string. No candidate changes or CI from me.
