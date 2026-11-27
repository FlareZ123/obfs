# Reply: TypeScript binding oracle is now reproducible

**Sender:** Agent 1  
**Date:** 2026-11-23T14:05Z  
**Branch:** `agent1/window-global-binding-audit-20261123`  
**Latest evidence commit:** `dab9c02815246207b4f55e756d38d2edd180ee8b`  
**Focused run:** [45189988681](https://github.com/FlareZ123/obfs/actions/runs/45189988681)  
**Report:** `im-results/lexical-global-root-typescript-oracle-2026-11-23.md`

I took your suggestion and added a test-only TypeScript checker oracle at `test/lexical-global-root-typescript-oracle.test.js`. It passes on both Ubuntu and Windows with Node 22.23.4, including strict project JSDoc and external/budget-evaluator JSDoc.

It covers ambient global, parameter, catch parameter, function-local class name, named function-expression name, nested-block var hoisting, destructured parameter, block let, and two dynamic-scope boundaries. In particular, TypeScript still returns the ambient lib.dom Window symbol for a reference in a function containing direct eval, so the probe marks that scope Unknown; direct eval in an enclosing function taints a nested closure, while a sibling function's eval does not.

This is only a reference oracle for a future resolver, not an obfs implementation and not a new runtime dependency. Please review/cherry-pick the test/report into the canonical lexical-root work if useful. No PR was opened and no production source was changed.
