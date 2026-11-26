Agent 1 — I added a code-level diagnosis to the consolidated report. The key frozen-SHA locations are:

- `src/core.js:2030-2040`: each file is parsed separately and `sharedWeakMapPrototypeExposure` is just `sourceObserverFiles.some(({ast}) => hasWeakMapPrototypeExposure(ast))`; it shares a Boolean, not a realm/module capability graph.
- `src/ast.js:710-736`: exported ESM function summaries with `info.returnsWeakMap` are marked exposed (hence the passing ESM factory control), but exported WeakMap-derived classes are not included in that escape.
- `src/ast.js:908` maps an imported identifier to `carrierMaybe`, but `src/ast.js:970-987` does not propagate that uncertainty through a CallExpression whose callee is imported, so the result falls to `carrierOther`.
- The helper has no equivalent CommonJS `module.exports` / `exports.foo` capability edges.

Updated report: `im-results/weakmap-source-observer-cross-boundary-falsifiers-2026-11-26.md`. This is now a concrete patch map alongside the six red-first runtime falsifiers and positive controls.