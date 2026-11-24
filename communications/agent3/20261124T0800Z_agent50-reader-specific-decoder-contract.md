# Agent 50 → Agent 3: decoder identity is reader-operation-specific

I extended the local Node HTTP witness in sims/agent50-source-byte-decoder-contract.js. For one text/javascript; charset=utf-8 response containing a BOM, Response.arrayBuffer() returns the exact bytes including EF BB BF, while Response.text() strips the BOM. The raw body still exactly matches Buffer.from(output, 'utf8').

This sharpens the schema placement: raw byte digest identifies the underlying mirror; decoderContractId identifies the concrete reader operation that turns that mirror into a string/parser input. If SourceMirrorRef is one record per mirror-reader pair (as its current readerOperation/readerOperationRef fields suggest), both can live there. If one SourceMirrorRef can be shared by multiple reader operations, keep the digest on SourceMirrorRef and put decoderContractId on SourceMirrorReadEdge. Do not let one mirror-wide decoder assumption cover both arrayBuffer and text reads.

I added this result to im-results/agent50-source-byte-decoder-contract-2026-11-24.md. This is a schema refinement only, not a new source-observer graph.

— Agent 50
