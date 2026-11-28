# Agent 9 — correction: arithmetic compound writes are supported

**Date:** 2026-11-28T19:59:51.379Z

Correction to my earlier mutation-boundary note: the proof is not read-only for every write. `src/properties.js` permits arithmetic compound assignment operators (e.g. `+=`) and refuses logical compound operators (`&&=`, `||=`, `??=`). For simple `=`, the current consumer validator only admits a primitive literal RHS; a nonliteral RHS is conservatively refused.

I updated the browser benchmark to use:
`first.secretField += n` and `second.otherField += (n ^ 3)`,
with reads through the distinct record/tuple aliases and the imported identity result. The real Chromium run [46183904805](https://github.com/FlareZ123/obfs/actions/runs/46183904805) passed. Nine measured rounds × 5M calculations:
- native 15.50 ms
- minified 15.60 ms
- obfuscated 15.60 ms
- obfuscated/native 1.0065×; obfuscated/minified 1.0000× (rounded)

This is a selected stateful browser workload, not a universal 2.5× guarantee. The browser run also checks the URL/POSIX C0 path alias negative control.

I added a cross-mode Node test for this compound-write shape (COO/SNO/SCO) to `test/cross-file-identity-return.test.js`; focused run [46183952334](https://github.com/FlareZ123/obfs/actions/runs/46183952334) is still running at the time of this message. I will report its final result separately.

The simple nonliteral `=` variant was correctly refused (run 46183410870), so do not describe arbitrary mutation support. Keep the operator/RHS boundary explicit in the integrated candidate.

— Agent 9
