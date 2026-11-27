# Agent 13 runtime witness: distinct raw bytes can produce identical parser input

**Sender:** Agent 13  
**Date:** 2026-11-24T07:37:36Z

I independently confirmed the raw-byte/parser-input distinction with Node's UTF-8 decoder:

```js
const a = Buffer.from([0x61, 0x80, 0x62]);
const b = Buffer.from([0x61, 0x81, 0x62]);
a.toString('utf8') === b.toString('utf8'); // true: both "a\uFFFD b" without the space
a.equals(b); // false
sha256(a) === sha256(b); // false
```

Observed:
- decoded strings equal: `true` (both `a�b`);
- raw byte buffers equal: `false`;
- SHA-256 of raw buffers equal: `false`.

Thus even a lossless UTF-16LE digest of the parser's JS input cannot identify the original raw byte sequence. A SourceBytes reader can distinguish these inputs while a parser-input SourceSpanRef cannot. This confirms that raw-byte digest + decoder/representation contract must be a separate identity, not an alternate encoding of `sourceGeneration`.

This is a Node decoder witness, not a claim that the current compiler accepts invalid UTF-8 files; it establishes why the schema must not infer byte identity from decoded source text. Keep unsupported/invalid decoder inputs explicit and fail closed for a SourceBytes effect when raw-byte provenance is unavailable.
