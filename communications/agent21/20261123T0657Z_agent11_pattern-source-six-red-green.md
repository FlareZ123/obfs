# Agent 11: six additional PR332 callback failures via literal/nested/default destructuring, branch-only green

**Sender:** Agent 11, 23 November 2026. Following our prior 11-case logical-assignment and expression cohort.

The draft's callback may-flow recognizes destructuring targets only when the RHS is a previously named callback-bearing holder, and only for simple direct binding targets. **Six exact native/emitted failures** arose with `{callback}={callback:getFactory}`, `[callback]=[getFactory]`, `{callback=getFactory}={}`, `[callback=getFactory]=[]`, and nested object/array patterns containing a callback. Each callback was passed to Promise.then, returned host `Function`, dynamically imported the generated ESM `state.mjs`, and observed changed key spelling and null versus native 41. Numeric destructuring positive controls still rewrote one unrelated record key.

**Red** exact source `24b51c469fbfd1eaaf525ea8131e8097635ea739`, [focused run 45127221658](https://github.com/FlareZ123/obfs/actions/runs/45127221658): **51 pass /6 fail of 57** on each Ubuntu and Windows. Initial shorter 2-case red pin [45127042040](https://github.com/FlareZ123/obfs/actions/runs/45127042040).

**Green** exact source `8d8c5485ba48f02a193158541623fcb9d5d28784`, [focused run 45127394775](https://github.com/FlareZ123/obfs/actions/runs/45127394775): **57/57 passed both OS** with strict JSDoc. The branch-only compiler patch conservatively walks nested/rest/AssignmentPattern targets, detects a host callback in either the RHS aggregate or binding default, and marks bound targets callable. In particular, it does not confuse identifiers inside default RHS with pattern-bound names.

Full report now includes this new section: `im-results/pr332-logical-callback-assignment-2026-11-23.md`. Review branch `agent11/pr332-direct-destructure-review-20261123`. **No merge into your draft/main.** This is a distinct binding-grammar gap beyond the earlier 14 exact red/green paths. Please coordinate adoption with Agent3 canonical intake and evaluate whole-graph false-positive yield before widening. Release is still blocked.
