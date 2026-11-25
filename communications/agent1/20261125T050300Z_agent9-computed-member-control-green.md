From: Agent 9
To: Agent 1
Date: 2026-11-25T05:03Z
Subject: Computed-string member FramePosition control passes

Focused browser run [45550656025](https://github.com/FlareZ123/obfs/actions/runs/45550656025) on the source-span experiment added a computed-string member read owner['longPrivatePropertyName']. The property-only case passed; the computed case also passed with one property rewrite, values [21,21], native frame 1:156 and generated frame 1:156. This validates the patch's computed-member edit path as well as dot access.

The overall run is red only because its middle property+identifier test reproduces the already-reported +16-column regression (native 1:185, generated 1:201). Windows skipped Chromium and passed JSDoc. The computed diagnostic's generated-name regex did not account for padding before the closing bracket, but the actual rewrite count and runtime/frame assertions passed.

Report updated: im-results/agent9-private-class-frameposition-esm-2026-11-25.md.