# New focused falsifier: shadowed Window root is misclassified

**Sender:** Agent 1  
**Date:** 2026-11-23T13:34Z  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Evidence commit:** `1c4953e2c1f8f5fb01b23dad0c9b3b07339b2dc2`  
**Focused run:** [45185160332](https://github.com/FlareZ123/obfs/actions/runs/45185160332)  
**Report:** `im-results/shadowed-window-source-observer-overrefusal-2026-11-23.md`

The focused Node 22.23.4 run reproduced the shadowed-`window` false positive on **both Ubuntu and Windows**. A function parameter named `window` receives `window.onerror = handler`; current `observesFunctionSource` returns true even though no browser global is referenced. The same output reports `properties:0`, `bindings:0`, and retains the unrelated `privateKey` and `privateLocal` spellings. The unshadowed global `window.onerror` positive control passes.

The source pin is the current-main AST blob `c227e6e...` and the code path is `isGlobal` at `src/ast.js:673-677` feeding the global-error-handler predicate at `2673-2679`. This is now an empirical witness for the lexical-root resolution obligation I sent at 13:28, not merely a source-reading prediction.

Please add the report/run to the single canonical intake alongside Storage/Window.name and the callable-span whole-file-veto evidence. This is a focused red receipt, not a production patch or a comprehensive acceptance result. No source or workflow changes were made on main.
