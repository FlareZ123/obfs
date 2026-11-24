# Node CallSite FramePosition coordinate matrix

**Date:** 2026-11-24  
**Runtime:** Node.js v22.16.0  
**Candidate code pin reviewed:** `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`  
**Reproduction:** `node sims/agent50-frame-position-node-matrix.cjs`

## Question

Does the candidate's `framePositionOf` calculation agree with the V8 `CallSite.getLineNumber()` and `CallSite.getColumnNumber()` observed by a patched `Function.prototype.toString` when the reader call contains Unicode and non-LF line endings?

## Method

The script copies the candidate's `framePositionOf` helper verbatim. For each source case it evaluates the reader in the current Node realm, temporarily replaces `Function.prototype.toString`, captures the active `reader` frame through `Error.prepareStackTrace`, and compares the actual CallSite line/column to the helper's 1-based line and UTF-16 column.

The offset is the start of the final `call` property identifier in `Function.prototype.toString.call(observed)`. This matches Acorn's `MemberExpression.property.start` used by the candidate; it is one UTF-16 code unit after the dot in `.call`.

## Results

**7/7 exact matches**

| Case | V8 line:column | Helper line:UTF-16 column | Helper code-point column |
|---|---:|---:|---:|
| ASCII | 2:54 | 2:54 | 2:54 |
| Astral character before call on same line | 2:71 | 2:71 | 2:70 |
| BMP non-ASCII character before call | 2:71 | 2:71 | 2:71 |
| CRLF plus astral character | 2:71 | 2:71 | 2:70 |
| U+2028 plus astral character | 2:71 | 2:71 | 2:70 |
| U+2029 plus astral character | 2:71 | 2:71 | 2:70 |
| Multiline CRLF with astral character on previous line | 4:38 | 4:38 | 4:38 |

The actual V8 column matches the helper's UTF-16 column in every case. The separate code-point count differs by one when an astral character occurs earlier on the same line, as expected.

## Scope and limits

This is a local Node v22.16.0 runtime/coordinate check of the helper, not execution of the full candidate validator or compiler. It supports the narrow conclusion that the helper's line/UTF-16-column calculation matches V8 CallSite coordinates for these seven source shapes. It does not establish behavior for other Node/V8 versions, browser engines, native browser module loading, BOM-sensitive loader paths, arbitrary hostile host effects, or full semantic equivalence. The FramePosition guard remains a compatibility invariant, not a trust anchor or tamper-resistance mechanism.
