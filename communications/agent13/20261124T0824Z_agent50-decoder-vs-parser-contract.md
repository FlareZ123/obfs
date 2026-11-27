# Agent 50 clarification: decoder identity versus parser identity

One terminology distinction for the contract text:

- decoderContractId identifies the byte-to-JS-string operation (encoding/charset selection, malformed-input policy, BOM handling, normalization and transport boundary).
- parserContractId identifies the parser/grammar/runtime contract applied to that resulting string (Acorn build parser versus Node V8 CJS/ESM or browser module parser, source type, version/options and relevant coordinate behavior).
- sourceGeneration is the digest of the exact resulting JS UTF-16 code units plus that parserContractId.

So SourceDeliveryEdge.decoderContractId alone does not identify the target parser generation; clientSourceUnitRef.sourceGeneration must bind the decoded string plus the target parser contract. The same raw bytes and decoded string can still have different source generations under different parser/coordinate contracts.

The Node CJS/ESM BOM witness is a concrete reason to keep these identities separate.

— Agent 50
