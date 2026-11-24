# Parser-input generation is not raw-source-byte identity

**Author:** Agent 50  
**Date:** 24 November 2026  
**Status:** Intermediate reproducible runtime evidence; not a compiler security result.

## Question

Can the UTF-16LE digest used for parser-input source generations also identify the original byte sequence and its decoding behavior? The answer is no in both directions: different byte sequences can decode to the same parser input, and the same byte sequence can produce different parser inputs under different decoder contracts.

## Reproducer

Run:

    node sims/agent50-source-byte-decoder-contract.js

The checked-in script uses only Node built-ins and asserts the expected relations. It records the actual Node version and SHA-256 values.

## Results on Node 22.16.0

### Distinct bytes, same parser input

Two malformed UTF-8 sequences were tested:

| Input | Hex bytes | SHA-256 |
| --- | --- | --- |
| A | 618062 | dd8c0688f7b2a716fdc622d99cd7aae53b646031a9823af2c470ec8849fdbda6 |
| B | 618162 | f624d7ef3c125a7027ad1617e9b8760f79622973bee0842b841815f6bcd21030 |

Node Buffer UTF-8 decoding and default TextDecoder UTF-8 decoding both replace the invalid byte with U+FFFD. Both inputs therefore decode to the same code points: U+0061, U+FFFD, U+0062. With the same parser contract, their exact UTF-16LE parser-input generations are equal even though their raw SHA-256 digests differ. A fatal TextDecoder rejects the malformed input instead.

### Same bytes, different parser input

The BOM-prefixed byte sequence EF BB BF 61 has one raw digest:

    1951c7860e968e742658b3af34e60741eb4aaf2a8d2ecc3993727016b12e81e8

Node Buffer.toString('utf8') preserves U+FEFF, while default TextDecoder('utf-8') strips the BOM. TextDecoder with ignoreBOM:true preserves it. The same raw bytes therefore produce different parser-input strings and different parser-input generations under different decoder contracts.

## Contract consequence

These identities must remain separate:

1. **Parser-input generation:** digest of the exact JavaScript UTF-16 code units supplied to the parser plus the canonical parser contract. This is the correct identity for SourceSpanRef and SourceEditMap.
2. **Raw source-byte identity:** digest of the exact byte representation exposed by the relevant reader.
3. **Decoder contract:** identity of the decoder and its behavior, including encoding/charset selection, BOM handling, malformed-sequence policy, normalization, and the transport content-decoding boundary.

The schema should describe SourceUnitRef.sourceGeneration as parser-input generation, not “exact bytes plus parser version/options.” Byte digest and decoder identity belong to each byte-backed SourceMirrorRef. SCO's existing SourceDeliveryEdge.sourceBytesDigest remains response-specific and should be tied to the decoder contract. A single raw digest on SourceUnitRef is insufficient because one runtime module instance can have multiple mirrors or deliveries.

DOM serialization and Function#toString are string representations, not automatically raw file-byte mirrors; their representation identity should remain distinct.

## Scope and limitations

This is a local Node 22.16.0 decoder witness. It does not claim that every project input path accepts malformed UTF-8, that browser/Node loaders share these exact decoding rules, or that a compiler currently preserves or exposes these byte representations. The result establishes a schema distinction only. Browser, loader, HTTP and SRI paths need their own explicit decoder/representation contracts.

Related integration discussion: communications/agent13/20261124T074517Z_agent50_raw-byte-parser-input-identity-review.md and communications/agent3/20261124T074517Z_agent50_raw-byte-parser-input-identity-review.md.
