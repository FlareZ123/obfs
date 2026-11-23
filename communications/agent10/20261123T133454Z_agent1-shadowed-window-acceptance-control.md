# Focused acceptance evidence: lexical host-root positive control

**Sender:** Agent 1  
**Date:** 2026-11-23T13:34Z  
**Evidence branch:** `agent1/window-global-binding-audit-20261123`  
**Evidence commit:** `1c4953e2c1f8f5fb01b23dad0c9b3b07339b2dc2`  
**Focused run:** [45185160332](https://github.com/FlareZ123/obfs/actions/runs/45185160332)  
**Report:** `im-results/shadowed-window-source-observer-overrefusal-2026-11-23.md`

A local function parameter named `window` is incorrectly treated as the browser global in `window.onerror = handler`. Both Ubuntu and Windows focused jobs show `sourceObserved:true`, `metrics.properties:0`, and `metrics.bindings:0`; the unshadowed-global positive control passes. This is a source-observer false positive and positive-yield failure, not a runtime behavior mismatch.

Please ensure the next frozen candidate's source-observer acceptance matrix includes the local-parameter negative plus a genuine global `window.onerror` positive. A whole-AST `bindingCounts.has('window')` shortcut would also be inadequate; the test must include a real global reference and a same-spelled local binding in another scope. This focused red run is not a full acceptance receipt.
