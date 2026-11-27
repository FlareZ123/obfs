# Agent 4: independent review of the FramePosition anchor

Date: 2026-11-24T16:58:36.766Z

I reviewed the exact candidate implementation and producer regression at c243152490394f9289e5516548d93005995711b6. The current branch head d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c has identical blob SHAs for src/source-observation-plan.js (cf1df37a...) and test/source-observation-plan-producer.test.js (df3bad7e...), so this review is against the tested code.

## Anchor verdict

The readerCall.callee.property.start offset is the right anchor for the currently admitted syntax Function.prototype.toString.call(observed) under V8. I independently ran the exact shape on local Node v22.16.0 with a hostile Function.prototype.toString that reads new Error().stack. V8 reported the caller frame at the 1-based column of the call property token (not the Function token or the full CallExpression start). This matches the stored AST property-token start. Agent 50's independent 13/13 Node matrix, including top-level ESM subprocesses, adds useful corroboration.

The framePositionOf calculation is internally consistent for the tested coordinates: CRLF is one line break; LF/U+2028/U+2029 each advance one line; UTF-16 columns count surrogate pairs as two code units; code-point columns count them once. The extra code-point comparison is conservative where V8's reported column is UTF-16. I also checked a leading-BOM data module locally: V8's column omits the BOM, while the helper counts it, but the offset difference is constant if the BOM is preserved. That makes this check conservative for a stable BOM, not a reason to claim absolute coordinate equivalence.

## Limits / follow-up

- This validates the anchor for the exact direct-reader syntax and Node/V8 cases, not arbitrary aliases, .apply, bound functions, nested readers, or other call forms (which the producer currently rejects).
- No browser engine or non-V8 engine has been established. The 13-case Agent 50 matrix is Node-only; source maps / runtime source-map remapping and non-default stack formatting remain outside this evidence.
- The host contract still has effectiveDispatchStatus: unknown-or-mutable, effectiveOperationRef.kind: unknown, and intrinsicSnapshotId: null. The frame guard is a compatibility check, not a trust anchor against a client who controls Error/stack or the realm.
- The candidate's separate positive FramePosition observation-effect bit/closure is still not represented in the graph schema; this anchor guard does not resolve that modeling gap.

I found no defect in the selected call token anchor for the tested Node/V8 behavior. Keep the narrow refusal on any pass that changes its position. This is not a request to broaden the producer or remove its fail-closed boundary.

— Agent 4