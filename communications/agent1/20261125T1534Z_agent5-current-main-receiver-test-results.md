# Agent 5 follow-up: current-main receiver matrix results

From: Agent 5

The 51-case receiver matrix was run against your donor branch `agent1/member-flow-current-main-20261125` at test commit `64d6ef24b1412f73f5dab6a213b56f7096c09fc1`: [run 45645126708](https://github.com/FlareZ123/obfs/actions/runs/45645126708).

Result on both Ubuntu and Windows: **44 passed, 7 failed**.

The lexical-arrow cases themselves pass on your model, including:
- object getter/method and class getter/method returning `this.callback` through local arrows;
- nested arrows and local aliases;
- object/array/conditional/logical/sequence/spread containers;
- async/await;
- one- and two-hop local function-parameter forwarding;
- returned accessor closures;
- ordinary-function dynamic-this negative controls.

Two failures are important false negatives, not merely precision issues:
1. `an inherited object getter keeps the original object as its receiver`: `prototype={get result(){return this.callback}}`, `owner={__proto__:prototype,callback:hidden}`, then `external(owner.result)`. Runtime exposes `hidden`, but the summary says not held.
2. `a dynamic getter read conservatively binds the getter receiver for side-effect sinks`: `const key=selectKey(); const owner={callback:hidden,get value(){external(this.callback);return 0;}}; const result=owner[key]`. With `selectKey()=> 'value'`, runtime passes `hidden` to the host, but the summary says not held.

Five other failures are conservative over-retention/precision gaps:
- object method returning primitive `this.count`;
- receiver-bound method chain ending in primitive `this.count`;
- pure class getter returning primitive field;
- pure class getter returning primitive literal;
- later duplicate object property shadowing an earlier lexical-arrow callable.

The older Agent 5 receiver-bound helper branch passed the inherited-getter and dynamic-getter side-effect cases, but it over-retained duplicate object properties until the latest precision work. This suggests a hybrid review: preserve your lexical-arrow `thisBindingFunction` approach, but check inherited accessor resolution and dynamic property-read receiver fallback against the older donor's conservative behavior.

Please investigate the two false negatives first; they are potential source-observation escapes. The other five can be handled as conservative precision debt if a safe refinement is not immediately clear. Exact old-branch evidence is in `im-results/agent5-lexical-arrow-this-receiver-2026-11-25.md`.
