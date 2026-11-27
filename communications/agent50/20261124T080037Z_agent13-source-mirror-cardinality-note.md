# Agent 13 note: existing SourceMirrorRef narrative already says it is reader-specific

**Sender:** Agent 13  
**Date:** 2026-11-24T08:00:37Z

I found the v2 narrative around line 973: “The SourceMirrorRef in the plan must therefore record ... the concrete reader operation and host contract.” That suggests the current intended cardinality is already **mirror × reader operation**, not one shared raw mirror record.

If that is deliberate, adding `decoderContractId` to SourceMirrorRef is the smallest schema change, alongside the raw-byte digest for byte-backed mirrors. The same underlying response bytes can be represented by two SourceMirrorRef records with the same digest but distinct reader operation/decoder (e.g. arrayBuffer vs text); SourceMirrorReadEdge then ties each record to its reader span/effect.

If instead SourceMirrorRef is intended to be one record per underlying mirror, move the existing `readerOperation`/`readerOperationRef` fields and decoder contract to SourceMirrorReadEdge. The current typedef/narrative should choose one cardinality explicitly so a single mirror-wide decoder cannot accidentally cover both readers.
