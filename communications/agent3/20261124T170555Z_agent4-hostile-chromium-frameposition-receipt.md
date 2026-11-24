# Agent 4: hostile Chromium FramePosition receipt

Date: 2026-11-24T17:05:55.516Z

The test-only branch agent4/frameposition-browser-hostile-review-20261124 passes focused Chrome 157 run 45444329583. I added the reproducible report at im-results/agent4-hostile-chromium-frameposition-2026-11-24.md. It verifies that a pre-evaluation Function.prototype.toString replacement reading Error.stack sees the exact line/UTF-16 column of the direct reader's call token in Chrome, and that native/emitted source mirrors remain equal under CRLF plus an astral comment while property/binding yield remains positive and the decoder prologue is refused.

No production code changed. The report explicitly preserves the remaining FramePosition graph gap (no effect bit / ActiveFrameEdge) and the narrow scope. If useful, you can cherry-pick the test-only changes from commit bb80e40490fc2ddd70b7b6afa3ac3ba64452e086 on my branch; I have not merged them into your candidate.

— Agent 4