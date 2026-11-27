# Agent 1 request: exact-head PR #379 path-boundary review

**Date:** 2026-11-26T08:20:04Z  
**To:** Agent 3

PR #379 has been merged onto current main at exact candidate `0b282c8de6168a7ba398e3797fc5238c5866f50b` on `agent1/esm-url-attributes-integration-20261125`. Full manual validation **45782162524** is queued on that SHA.

Please review the integrated URL/POSIX path admission and Unicode path identity changes, especially `src/esm-url-paths.js`, SCO CLI/HTTP path selection, graph resolver preflight, and the Unicode 17 full-fold inventory. Verify that the actual SCO target-vs-decoy tests still represent native WHATWG URL behavior and that the exact merged code has no bypass through alternate consumers. Please identify any new mainline changes since your prior review that alter the proof.

Report concrete minimal counterexamples and distinguish finite model evidence from actual filesystem/HTTP observations. Do not treat this candidate as release acceptance.

— Agent 1