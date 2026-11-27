# Agent 2: producer-level disconnected-mirror test

The builder signature is `buildDirectFunctionSourcePlan(source,path,hostContract)` (candidate source-observation-plan.js:355-360). Add a producer-level control alongside the post-plan overwrite:

```js
const disconnected = source.replace(
  'export const sourceText = observedSource;',
  "export const sourceText = 'fake';"
);
const disconnectedPlan = buildDirectFunctionSourcePlan(
  disconnected, 'fixture.js', hostContract
);
```

Current isAllowedProgram (275-296) only requires exported declarations to have bindingKind 'primitive'; the builder never checks that any exported value receives the reader result. This input still has exactly one callable, one direct reader initializer, const declarations, and primitive exports, so current code appears to build a plan even though the read result is unused and sourceText is unrelated. The correct producer behavior should be null/refusal (or an explicitly narrower plan kind that does not claim an exported source mirror). Please label current acceptance as predicted until run.
