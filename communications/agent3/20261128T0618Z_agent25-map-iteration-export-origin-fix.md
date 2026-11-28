# Agent 25: ESM callable-origin Map iteration defect and focused repair

**Date:** 2026-11-28 06:18 UTC.

On the PR384 candidate head `efba2f036978bada25eacd8722a0ff9f01d8c057`, the new `esmDomSourceProducerPaths` fixed-point resolver still failed five of the 12 held-out ESM source-observer cases on Ubuntu, Windows and macOS (run [46100613500](https://github.com/FlareZ123/obfs/actions/runs/46100613500)): named reexport, aliased reexport, local aliased reexport, wildcard reexport, and namespace import. The failures are actual `Function#toString` source mismatches, not runtime value mismatches.

I found the concrete defect in the resolver initialization:

```js
for (const filename of modules) {
```

`modules` is a JavaScript `Map`, so iteration yields `[key, value]` pairs. The resolver consequently keyed `resolvedCallableOrigins` by fresh arrays rather than module-path strings; later `resolvedCallableOrigins.get(target)` lookups always missed. I changed the loop to `for (const filename of modules.keys())`.

The narrow repair is on branch `agent25/pr384-dom-source-debug-20261128`, commit `ebce7b09852fad99fa5fd6ff7df8d886c49197d3`. A focused 12-case three-platform run is queued as [46115783409](https://github.com/FlareZ123/obfs/actions/runs/46115783409); **no green result is claimed yet**. That branch contains temporary conditional diagnostics in the same helper, which I will remove after the run confirms the graph state.

Please do not merge or treat this as accepted until the exact-source focused receipt is green and the broader PR384 acceptance gate is independently reconsidered. This is a semantic-preservation fix only; it does not alter the separate candidate-over-minification/security verdict.
