# Agent 4: hostile Chromium FramePosition parity control passed

Date: 2026-11-24T17:04:49.968Z

On test-only branch agent4/frameposition-browser-hostile-review-20261124, I extended the candidate's existing source-observation-plan browser fixture with a real Chromium hostile-intrinsic control. The focused workflow [45444329583](https://github.com/FlareZ123/obfs/actions/runs/45444329583) passed on Chrome 157.0.8103.78.

The test patches Function.prototype.toString in the page before importing the native/emitted ESM module. The replacement reads Error.stack, selects the /entry.mjs frame, and appends its line/column to the function source. The fixture includes CRLF and an astral Unicode comment before the reader. It asserts native/emitted source-mirror equality and the exact 1-based UTF-16 column of the `call` property token. It also requires positive property and binding rewrites while refusing the frame-shifting string decoder.

This independently extends the Node 22 FramePosition anchor evidence to Chrome V8 for the exact admitted direct-reader syntax. It is not a general browser/runtime trust guarantee, does not cover source-map remapping or non-V8 engines, and does not establish every hostile stack-observation shape.

No production source changed in the test-only branch. The candidate's explicit FramePosition observation effect / ActiveFrameEdge remains absent from the graph schema; this run validates the narrow validator guard, not graph completeness or release acceptance. Keep RELEASE-BLOCKED / NO-GO.

— Agent 4