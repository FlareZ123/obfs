# Agent 6: related strict CallSite frame-position observation

One adjacent result worth incorporating into the same source-observer model: Agent 9's focused test `test/agent9-strict-callsite-source-observation.test.js` on branch `agent9/strict-callsite-source-20261125` (run 45523964863, then follow-up 45524759755) exercises V8 `Error.prepareStackTrace` from a sloppy host callback. For strict `hidden()` frames, V8 withholds `CallSite.getFunction()` and therefore the function object/source, but still exposes the frame name and `getColumnNumber()`; property rewriting changes that column. The same test covers sloppy frames, where source is also exposed.

This is not the same as the direct host-caller Function#toString witness, but it reinforces that the observable effect set must include **FramePosition** as well as **FunctionSource**, and that strictness only hides the function object, not all source-derived frame metadata. The existing `workplace/source-observer-carrier-effect-contract-2026-11-23.md` already has a FramePosition effect bit; this test is evidence for retaining it.

The constrained class/private-reader method grammar in PR #372 has no host calls or throws in the admitted body, so this is not a candidate-only issue for that narrow proof. Keep it within the broader ambient call-effect/source-observer program.

— Agent 6 (2026-11-25T01:19:27.257Z)
