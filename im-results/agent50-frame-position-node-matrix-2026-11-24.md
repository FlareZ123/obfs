# Node CallSite FramePosition coordinate matrix

**Date:** 2026-11-24  
**Runtime:** Node.js v22.16.0  
**Candidate code pin reviewed:** `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`  
**Reproduction:** `node sims/agent50-frame-position-node-matrix.cjs`

## Question

Does the candidate's `framePositionOf` calculation agree with V8 `CallSite.getLineNumber()` and `CallSite.getColumnNumber()` for the direct `Function.prototype.toString.call(observed)` reader, including its actual top-level ESM placement?

## Method

The script copies the candidate's `framePositionOf` helper verbatim. It runs two matrices:

1. Seven function-reader cases evaluated in the current Node realm with `vm.runInThisContext`.
2. Six native `.mjs` subprocess cases whose reader call is at ESM module top level, matching the candidate's supported producer shape. A temporary Function#toString patch captures the final same-file module CallSite frame through `Error.prepareStackTrace`.

Each observed line/column is compared with the helper's 1-based line and UTF-16 column. The reader offset is the start of the final `call` property identifier. This matches Acorn's `MemberExpression.property.start` used by the candidate; it is one UTF-16 code unit after the dot in `.call`.

## Results

**13/13 exact matches on Node v22.16.0**

| Mode | Case | V8 line:column | Helper line:UTF-16 column | Helper code-point column |
|---|---|---:|---:|---:|
| vm function | ASCII | 2:54 | 2:54 | 2:54 |
| vm function | Astral before call on same line | 2:71 | 2:71 | 2:70 |
| vm function | BMP non-ASCII before call | 2:71 | 2:71 | 2:71 |
| vm function | CRLF plus astral character | 2:71 | 2:71 | 2:70 |
| vm function | U+2028 plus astral character | 2:71 | 2:71 | 2:70 |
| vm function | U+2029 plus astral character | 2:71 | 2:71 | 2:70 |
| vm function | Multiline CRLF with astral character on previous line | 4:38 | 4:38 | 4:38 |
| native ESM top-level | ASCII | 7:50 | 7:50 | 7:50 |
| native ESM top-level | Astral before call on same line | 7:68 | 7:68 | 7:67 |
| native ESM top-level | CRLF plus astral character | 7:68 | 7:68 | 7:67 |
| native ESM top-level | U+2028 plus astral character | 7:68 | 7:68 | 7:67 |
| native ESM top-level | U+2029 plus astral character | 7:68 | 7:68 | 7:67 |
| native ESM top-level | Multiline CRLF with astral character on previous line | 8:50 | 8:50 | 8:50 |

The actual V8 column matches the helper's UTF-16 column in every case. The separate code-point count differs by one when an astral character occurs earlier on the same line, as expected.

## Scope and limits

This is a local Node v22.16.0 runtime/coordinate check of the helper, not execution of the full candidate validator or compiler. It supports the narrow conclusion that the helper's line/UTF-16-column calculation matches V8 CallSite coordinates for these thirteen source shapes, including native top-level ESM. It does not establish behavior for other Node/V8 versions, browser engines, BOM-sensitive loader paths, arbitrary hostile host effects, or full semantic equivalence. The FramePosition guard remains a compatibility invariant, not a trust anchor or tamper-resistance mechanism.
