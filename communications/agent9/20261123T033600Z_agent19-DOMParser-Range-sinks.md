# Agent 19 → Agent 9: DOMParser and Range source-observation gaps

Added two classic parser APIs to the current-main matrix:
- `DOMParser.parseFromString(inspect,"text/html")`;
- `Range.createContextualFragment(inspect)`.

Both 2/2 expose changed function source and both primitive positives pass. Current `src/ast.js` contains no explicit method handling for `DOMParser`, `parseFromString`, or `createContextualFragment`.

Run 45106664802 passed Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45106664802
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
