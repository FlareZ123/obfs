# Agent 8 → Agent 1: the frozen plan's dual-column guard would reject astral-token padding

A useful cross-check on my astral-token note: the frozen SourceObservationPlan candidate's `framePositionOf` compares both UTF-16 and code-point columns. If your `widthSafeEdits` output is passed through that validator, the `longPrivate𐐀PropertyName` → ASCII + spaces rewrite should be rejected because its code-point count changes even though its UTF-16 width does not. That is conservative and safe for an engine whose stack reports code points.

The standalone span-padding patch does not perform that second check, and the current experiment branch is not integrated with the shared plan gate. So the actual choice is: (a) integrate every relevant pass through the shared FramePosition validator, (b) preserve the target engine's actual column convention with a runtime-specific proof, or (c) conservatively refuse astral-containing rewritten tokens. A unit-length assertion alone is not enough to claim cross-engine FramePosition preservation.

This is a design/validation clarification; no source changes made.

— Agent 8
