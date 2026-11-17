# Disguised UTF-16 source maps bypassed the UTF-8 JSON asset scanner

**Date:** 17 November 2026. **Classification:** intermediate engineering security boundary. A byte-encoding source disclosure is demonstrated and a narrow fail-closed preflight repair is implemented; it is not a proof that arbitrary opaque assets cannot carry original JavaScript.

## Frozen negative witness

The existing `isSourceMapDocument(Buffer)` preflight screens for UTF-8 JSON maps by skipping UTF-8 BOM/whitespace, checking the `{` prefix, decoding with `Buffer.toString('utf8')`, and parsing a version-3 map shape. An asset containing the *same* JSON map in UTF-16LE with no BOM begins with `7b 00 22 00 ...`, passes the byte-`{` prefix check, then fails JSON parse because the UTF-8-decoded text contains interleaved NULs. A UTF-16BE object starts with `00 7b` and does not even pass that prefix check.

A local Node 22.16.0 check used a real version-3 map with `sourcesContent:['const PRIVATE=41']` encoded as UTF-16LE, observing `Buffer.toString('utf8')` produce `SyntaxError` while the actual UTF-16 decode plus `JSON.parse` recovered `const PRIVATE=41`. The original source is recoverable from distributed asset bytes independently of any obfuscator secret. This is a source-distribution/preflight failure, not a proof of automatic source recovery from transformed JavaScript.

## Repair and regression

`src/source-maps.js::utf16JsonEncoding` now recognizes leading JSON whitespace and opening brace represented as UTF-16LE/BE pairs, with or without an encoding BOM, **without decoding unrelated binary payloads**. The recognized input is decoded by the native WHATWG `TextDecoder` before the pre-existing version-3 shape check; a non-map JSON document remains publishable byte-exact. This uses Node's documented [TextDecoder UTF-16 support](https://nodejs.org/download/release/latest-jod/docs/api/util.html).

The same asset preflight is shared by COO/SNO transformations and SCO handler publication. The new `test/source-map-utf16-asset.test.js` covers 8 UTF-16LE/BE, BOM/no-BOM, leading-whitespace variants for each mode, explicitly rejected indexed and escaped-key maps, and retained ordinary UTF-16 JSON and opaque binary bytes. JSDoc strict checking and a two-OS test step were wired into the existing manually dispatched transform safety workflow.

- [Compiler-side decoder preflight](https://github.com/FlareZ123/obfs/commit/e0b279bf7ca075ac89cb3d3da6d0031a85a468d4)
- [Negative and positive regression](https://github.com/FlareZ123/obfs/commit/c97864ef36e697659b72a6bbc7a2146ee41914a5)
- [Escaped-key fixture correction](https://github.com/FlareZ123/obfs/commit/16294db039a6a65ca2ee582b0ccb96608bacbfc9)
- [Two-OS manual step](https://github.com/FlareZ123/obfs/commit/fa24304475c3f0e89c17e8a759e4fa95f1e887d8)
- [Strict external JSDoc inclusion](https://github.com/FlareZ123/obfs/commit/8b575776dac483edde78f744896452233af3fa24)

## Evidence state and limits

The initial regression was added after the earlier path-only Windows/Linux CI evidence. A manual source-pinned run at commit `8b575776dac483edde78f744896452233af3fa24` was dispatched as [run 44065007971](https://github.com/FlareZ123/obfs/actions/runs/44065007971); **cross-platform outcomes were pending when this draft was written**. Local JSON encode/decode behavior alone does not establish every compiler path passes.

The scanner deliberately recognizes a bounded set of source-map JSON formats. Other encodings, generic base64 blobs, arbitrary compressed containers and source-embedded binary custom sections can still carry original code, sometimes without a source-map wrapper. The project explicitly cannot prove opaque distributed assets source-free by finite format heuristics. A deployment requiring strict source confidentiality should publish only reviewed or proven-safe assets. This change adds build-time/handler-initialization work for positively identified UTF-16 JSON candidates; no extra obfuscated runtime instructions were emitted. It supplies no new adversarial reconstruction or 2.5× runtime-performance result.
