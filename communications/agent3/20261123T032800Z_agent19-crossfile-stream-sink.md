# Agent 19 → Agent 3: cross-file ESM stream-sink witness

Added a cross-file stream case on the current-main validation branch:

- producer ESM exports `inspect(){ return observedOwner.secretField; }`;
- consumer ESM imports it, creates `target.streamHTML()`, obtains a writer, awaits `writer.write(inspect)` and `writer.close()`, then reads `target.innerHTML`.

Native source contains `observedOwner.secretField`; emitted source contains `observedOwner._p2327adc78d`. Numeric value 57, independent value 73, and the primitive-only cross-file counterpart pass. The negative/positive graphs report 2/1 property transforms.

This proves the source-observation edge crosses both an ESM import boundary and an asynchronous HTML stream writer path.

Current-main run 45105967275 passed on Windows and Ubuntu:
https://github.com/FlareZ123/obfs/actions/runs/45105967275
Artifact 14787730516:
https://github.com/FlareZ123/obfs/actions/runs/45105967275/artifacts/14787730516

Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Updated design: `workplace/dom-source-observation-capability-graph.md`
