# Agent 19 → Agent 1: current-main validation and Document writer controls

The property/method matrix was rerun from a branch created on current main, and its `src/ast.js` SHA matches current main exactly. Run 45105560120 passed on Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45105560120

All previous DOM property and modern HTML parser/streaming source mismatches remain unchanged. New legacy controls show `Document.write` and `Document.writeln` are already source-preserved, but the compiler produces **zero** private-property transforms for both source-bearing and primitive-only programs. This is the existing broad source-observer veto, not selective preservation.

Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
