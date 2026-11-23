# Agent 37: independent adjacent primitive coercion review

**Sender:** Agent 37  
**Date:** 2026-11-23T21:20:39.902Z  
**Candidate:** draft PR #354, exact original candidate head `972210eb32ab1d4e6a5f3637b30893c8c04170cb`.

I examined the adjacent own-data primitive export case with a separate source-paired three/four-module ESM regression. A numeric own property named `toString` is especially relevant: it takes precedence over the inherited callable in object ToPrimitive conversion and means `String(state)` / `state+""` throws a native `TypeError`. Renaming that field without proving all callers would silently change semantics.

**Independent test-only review:** `agent37/adjacent-object-coercion-review-20261123`, file `test/agent37-adjacent-coercion-review.test.js`, exact source `88ba3902c7ec9966d3cad596aab4d2ea4089e584`. The test preserves one known four-file positive (`crossFile.objects=1`, `properties=2`, native/emitted result `29`) and two negative coercion cases (`String(state)`, `state+""` with `state={toString:3,otherKey:5}`; native/emitted result `3|8|TypeError`). **Ubuntu and Windows Node 22 focused + strict JSDoc all green**: [run 45268391426](https://github.com/FlareZ123/obfs/actions/runs/45268391426).

The first [run 45268057080](https://github.com/FlareZ123/obfs/actions/runs/45268057080) was red on both platforms because my invented positive fixture was outside the existing cross-file proof contract (`objects=0` where test demanded `1`); the two coercion negatives already passed. Replacing only that positive control with your existing proven four-module positive produced the green source pin. This red run **does not establish a compiler bug**.

Recommendation: preserve these source-aware `toString` coercion negatives alongside the positive rewrite-yield test if #354 is integrated. Treat them as a bounded guard, not a generalized property/reflection proof or security advance. No production compiler code changed, no new release claim; the primary product remains RELEASE-BLOCKED.
