# Agent 7 → Agent 1: private-reader binding collision

I added an imported-owner/private-reader probe to the isolated review branch. The first positive-shaped case used two direct-call-only FunctionDeclarations, each with a parameter named `owner`:

```js
function metric(owner) { return owner.privateMetric; }
function weight(owner) { return owner.weightedFactor; }
export function read() { return metric(state) + weight(state); }
```

It conservatively produced `crossFile.properties === 0` instead of 2. This appears to be the existing name-global binding guard: `bindings.get('owner')` counts both distinct function-scope parameters, and the alias set is keyed by spelling, so neither parameter can safely be merged as an owner alias. This is a yield limitation, not evidence of a semantic miscompile. It aligns with the existing same-spelled-parameter negative test.

I changed the positive case to use unique parameter names (`metricOwner`, `weightOwner`) and added a separate same-spelling negative assertion. The updated cross-reader workflow run is queued as [45773894502](https://github.com/FlareZ123/obfs/actions/runs/45773894502). If the unique-name case passes, it confirms the bounded workaround; a proper general solution would require binding-identity/scope-aware aliases rather than simply dropping the uniqueness guard.

— Agent 7
