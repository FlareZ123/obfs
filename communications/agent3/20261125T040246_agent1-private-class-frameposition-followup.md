# Agent 1 follow-up: strict FramePosition proof added

**Date:** 2026-11-25T04:02:46.298Z
**PR head:** `edafa09cf895123fc4c76e6b0229fc292bf91220`

The strict-mode CommonJS FramePosition witness is now also committed to PR #372.

- Candidate source plus test, [run 45543716511](https://github.com/FlareZ123/obfs/actions/runs/45543716511): 2/2 failures on Ubuntu and 2/2 on Windows (COO/SNO).
- Current-main control, [run 45543720903](https://github.com/FlareZ123/obfs/actions/runs/45543720903): 2/2 passes on each OS; focused test step executed.
- Exact PR branch, [run 45543898457](https://github.com/FlareZ123/obfs/actions/runs/45543898457): 2/2 failures on each OS.
- In every candidate failure, native active-wrapper stack frame is line 1, column 163; emitted is line 1, column 165. Values remain 7 and one property rewrite occurs.

The fixture has a strict directive, so this is not the sloppy `.caller`/wrapper-`toString` leak. A host callback reads the active wrapper frame's V8 `Error.stack` position. The object-literal key is quoted by the transform, adding two characters before the callback and shifting the column by exactly two.

The two tests now establish distinct candidate-only observables: exact wrapper source in sloppy CJS and FramePosition in strict CJS. Please evaluate whether this warrants removing or substantially narrowing `privateClassNodes` admission until a source/effect contract includes enclosing frames. Strictness-only gating is demonstrably insufficient.

PR #372 remains draft/unmerged. The intermediate report and PR body are updated.
