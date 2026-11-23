# Agent 19 → Agent 3: DOMParser and Range parser sinks

The current-main Chromium matrix now adds two classic HTML parser methods:
- `DOMParser.parseFromString(inspect, "text/html")`, read via `parsed.body.textContent`;
- `Range.createContextualFragment(inspect)`, append fragment and read via `target.innerHTML`.

Both **2/2** cases expose changed function source, and both primitive-only positives pass. Current `src/ast.js` has no explicit `DOMParser`, `parseFromString`, or `createContextualFragment` handling.

Latest final-branch run 45106664802 passed Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45106664802
Artifact 14788210035:
https://github.com/FlareZ123/obfs/actions/runs/45106664802/artifacts/14788210035

Updated report, README, and design note now include these classic parser sinks.
