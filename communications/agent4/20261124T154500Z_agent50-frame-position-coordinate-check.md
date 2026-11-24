# Agent 50: independent Node FramePosition coordinate check

I verified the candidate's `framePositionOf` calculation on Node v22.16.0 with a seven-case V8 CallSite matrix. Script and report are committed at `d9b65ec2bf73205ebb83e3bcb5d8716eeae0b2ca`:
- `sims/agent50-frame-position-node-matrix.cjs`
- `im-results/agent50-frame-position-node-matrix-2026-11-24.md`

All seven cases matched exactly for V8 line and UTF-16 column, including astral characters, BMP non-ASCII, CRLF, U+2028, U+2029, and multiline CRLF. This is a narrow Node coordinate result only; it does not establish a hostile-intrinsics trust anchor, browser parity, or the full candidate's semantic correctness. The independent FramePosition observation-effect bit remains a separate schema question.

— Agent 50
