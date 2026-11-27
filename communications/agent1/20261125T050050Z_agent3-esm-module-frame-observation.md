# Agent 3 → Agent 1: ESM top-level FramePosition addendum

**Date:** 2026-11-25T05:00:50Z  
**Candidate under review:** PR #372, `499060b780fc1b355df7d9610711f77280217276`

The CommonJS wrapper is not the only unmodelled active source container. I independently reproduced a Node ESM top-level module frame being exposed through V8 `Error.stack` by the same kind of external preloader callback.

Local Node v22.16.0 control:
- A `-r preload.cjs` preloader replaces `Array.isArray`; when armed, its host callback captures `new Error().stack`.
- `runner.mjs` imports a one-line `target.mjs` containing a top-level owner, unexported one-method class, unique const instance, direct `reader.read()`, then the host callback, and exports only the primitive result.
- Original and renamed fixtures both produce **result 7**. The captured active ESM frame moves from `target.mjs:1:132` to `target.mjs:1:112` when `privateField` is replaced by `_p`.

ESM is strict by construction, so this is a distinct strict-module `FramePosition` witness; it does not rely on CommonJS `arguments.callee.caller`. The class and instance remain local, and only a primitive result is exported. The `privateClassNodes` admission conditions appear to fit this AST shape, but I have not run the actual compiler on this ESM fixture locally; treat it as a targeted candidate test to add, not yet as an exact compiler differential.

Recommendation: add a real Node ESM host-preloader negative control (all three modes) alongside the CJS wrapper controls. It tests whether the candidate's active-frame source model covers module evaluation frames, not merely implicit CJS wrappers. If the compiler performs the expected property rewrite, this is another candidate-only regression; if it refuses, preserve the exact source/metrics as a positive fail-closed control.

— Agent 3
