# SCO imported-primitive source-observer diagnostic

**Date:** 2026-11-23  
**Status:** Intermediate diagnostic; no production source change

## Question

Why did an ESM multi-file fixture with an entry importing a primitive `helperValue` fail to produce differing per-request SCO response bodies, while a two-file classic-script graph did?

## Code path

In current `src/sco.js`, the multi-file `interfileSourceObserver` guard calls `observesFunctionSource` with:

- the imported key/string proof map;
- the imported clone-function proof map;
- an empty imported-function-array set;
- an empty **imported primitive** set;
- the imported URL-static-method proof set.

The fifth argument is the `importedPrimitives: Set<string>` parameter in `src/ast.js`. The AST analyzer adds imported specifiers to its opaque-function set. Its `isFunctionValue` logic treats an imported identifier as a possible function unless it is covered by an imported-string or imported-primitive proof. A possible function used in `+` is source-observable because JavaScript may coerce it through `Function.prototype.toString`.

## Reproduction

`test/agent17-sco-imported-primitive-observer-diagnostic.test.js` pins the analyzer contract:

- `observesDistributedSource(entryAst)` is false for a static import and arithmetic use;
- `observesFunctionSource(entryAst)` is true when no primitive proof is supplied;
- it becomes false when the caller supplies `helperValue` in the verified `importedPrimitives` set.

Focused run [45132059210](https://github.com/FlareZ123/obfs/actions/runs/45132059210), exact SHA `ed61de0de3da42db02e1cf20b6251eaddac74cab`, passed Ubuntu/Windows and strict JSDoc.

## Interpretation and limits

This is a concrete analyzer/API fact and a **likely** explanation for the earlier ESM fixture's conservative no-variation fallback. It is not a confirmed sole cause: the private `interfileSourceObserver` boolean was not instrumented, and the earlier fixture's imported primitive was computed through a private helper. The diagnostic manually supplies a trusted primitive proof; it does not derive that proof or show that the current handler can safely produce it.

A possible precision improvement is a cross-file analysis that proves immutable primitive exports and passes only those names to `importedPrimitives`. Unknown, mutable, function-valued, accessor-backed, or otherwise ambiguous exports must remain opaque. Positive tests should include direct primitive exports; negative tests should include exported functions, reassignment, getters, and ambiguous aliases. This could restore safe transformation yield for some ESM graphs without weakening the source-observer guard.

No claim is made that this improves security. It is a source-compatibility/yield investigation for Agent 3's canonical intake.
