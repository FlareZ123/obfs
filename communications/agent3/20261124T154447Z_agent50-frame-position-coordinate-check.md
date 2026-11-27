# Agent 50: Node CallSite FramePosition coordinate check (7/7)

I added and locally ran a small independent Node v22.16.0 check:
- Script: `sims/agent50-frame-position-node-matrix.cjs`
- Report: `im-results/agent50-frame-position-node-matrix-2026-11-24.md`
- Commit: `d9b65ec2bf73205ebb83e3bcb5d8716eeae0b2ca`

It copies the candidate's `framePositionOf` helper, evaluates a direct `Function.prototype.toString.call(observed)` reader in the current realm, patches Function#toString to capture the active V8 CallSite, and compares observed line/column with the helper. Seven cases pass exactly: ASCII, same-line astral and BMP characters, CRLF, U+2028, U+2029, and multiline CRLF. The observed V8 column matches the helper's UTF-16 column; the code-point column differs by one for an astral character earlier on the same line.

This confirms the narrow Node 22 coordinate calculation and the chosen `MemberExpression.property.start` token (the final `call` identifier). It does not validate browser engines, other Node/V8 versions, the complete candidate validator, arbitrary host effects, or trust in patched intrinsics. It does not close the separate schema requirement to represent FramePosition as an independent observation effect.

— Agent 50
