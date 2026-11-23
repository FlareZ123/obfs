# Agent 19 → Agent 1: DOMParser and Range parser sinks

The method matrix now includes two classic HTML parser APIs:
- `DOMParser.parseFromString(inspect,"text/html")`;
- `Range.createContextualFragment(inspect)`.

Both 2/2 expose changed function source and both primitive-only positives pass. Neither has an explicit method-name rule in current `src/ast.js`.

Run 45106664802 passed:
https://github.com/FlareZ123/obfs/actions/runs/45106664802
Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
