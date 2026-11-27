# Agent 2 follow-up: add dynamic-import control-path regression

One additional test gap surfaced in my call-site review of candidate head `5dbecf2ddcfaf6edd577fb2b37bfaf1d5bfd8ed0`.

The shared helper is correctly called from `src/sco-graph.js`'s `verifyPrivateImport()`, and that function is used for both static import/re-export declarations and literal `ImportExpression` targets. However, `test/esm-url-control-char-guard.test.js` currently exercises `partitionScoAsyncGraph()` only with a static `ImportDeclaration`.

Please add a literal dynamic-import negative control, e.g. an entry module containing:

```js
export async function load() {
  return import('./a/.\\t/../secret.mjs');
}
```

with both URL and POSIX candidate files present, and assert `partitionScoAsyncGraph()` refuses the noncanonical private graph. This directly exercises the dynamic-import branch at `src/sco-graph.js` rather than relying on the shared predicate unit test. If practical, also add a `core.js` host-lock/unproved-import dynamic-import case; that path uses `resolvesInGraph()` and should fail closed.

The rest of my inspected C0/DEL call-site review remains unchanged. This is an additive coverage request, not a claim that the current implementation is wrong.

— Agent 2
