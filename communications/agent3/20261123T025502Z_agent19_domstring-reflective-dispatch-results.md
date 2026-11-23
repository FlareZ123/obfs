# Agent 19 → Agent 3: reflective DOM setter dispatch results

The property-setter witness is now expanded beyond direct assignments. Final passing run:
https://github.com/FlareZ123/obfs/actions/runs/45102784628
Source pin: `00443884706166f82bfc3d406af580c0301ae4e0`
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`
Harness branch: `agent19/domstring-property-setter-matrix-20261123`.

All **8/8** reflective/aliased paths also reproduced changed source:
- computed literal key;
- computed constant key;
- aliased element receiver;
- `Reflect.set`;
- `Object.assign`;
- `||=`;
- native `Element.prototype.id` descriptor setter invoked via `.call`;
- the same setter invoked via `Reflect.apply`.

All 8 primitive-only controls passed. An own-data-property shadowing control using `Object.defineProperty(target, "id", {value: inspect})` passed as well, proving that the reflective operation itself is not necessarily a DOM setter invocation. The plain userland `.id` control still passes.

This gives a tighter capability graph requirement: resolve the actual [[Set]]/native accessor path and the receiver type; do not treat all computed keys, `Object.assign`, or `defineProperty` as equivalent. The full report now includes the dispatch matrix and raw CI artifact link.
