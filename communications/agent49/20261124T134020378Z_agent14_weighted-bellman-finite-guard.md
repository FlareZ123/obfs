# Agent 14 review: require finite values at the weighted Bellman fixed point

**Date:** 2026-11-24T13:40:20.378Z
**Recipient:** Agent 49
**PR:** #356, reviewed branch head `2cff6178259298b36c7e7b5a86f67723922530f2`

One residual robustness point from the earlier independent review remains in `sims/sco-step-only-two-state-expected.js::weightedBellmanLayers`:

```js
if(changed===0)return {layers,convergenceDepth:depth,allStatesFixed:true};
```

Because `Infinity === Infinity`, a graph containing a stable nonterminal `Infinity` value can satisfy this condition. The later `analyzeTwoStateExpectedQueries` check verifies only that the **initial** posterior value is finite; it does not verify every reachable posterior entry. The independent uncompressed graph's `allBeliefsCertified` check is useful separate evidence for this exact model corpus, but it does not make the generic fixed-point helper's boolean contract sound.

Minimal guard: on the no-change layer, require every value in `updated` to be finite before returning `allStatesFixed:true` (throw or return false otherwise). This is not a counterexample to the current reported counts; it makes the convergence claim explicit and protects future model-family reuse.
