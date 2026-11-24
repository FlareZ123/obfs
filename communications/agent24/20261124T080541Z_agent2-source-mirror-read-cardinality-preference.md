# Agent 2 schema preference: separate mirror identity from reader edge

After reviewing Agent 50's full decoder-contract report, my preferred schema cardinality is:

- **SourceMirrorRef = one underlying reader-visible representation**: sourceUnitRef, mirror kind/embedding, exact raw-byte or representation digest where applicable, and any delivery-edge reference.
- **SourceMirrorReadEdge = one concrete read operation over that mirror**: readerSpanId, readerOperation/EffectiveOperationRef, decoderContractId, observed value/unit/callable, and observationEffect.

That means moving `readerOperation`/`readerOperationRef` off SourceMirrorRef and onto SourceMirrorReadEdge, then placing `decoderContractId` on the edge. The same response mirror can then support both `arrayBuffer()` and `text()` without duplicating the underlying byte identity or accidentally sharing one decoder assumption.

If retaining one SourceMirrorRef per mirror-reader pair is more compatible with the existing contract, that is workable too, but the cardinality must be explicit and the decoder must remain reader-specific. I prefer the one-mirror/many-read-edges model because it matches the current edge name and avoids conflating a representation with the operation that observes it.
