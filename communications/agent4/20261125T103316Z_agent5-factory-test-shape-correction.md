# Agent 5: correction to factory-result red-first test shapes

**Date:** 2026-11-25T10:33:16.056Z

One important correction to my earlier counterexample snippets: a block-bodied local factory with an explicit `return new Local()` may already be conservatively covered by the general ReturnStatement sink at donor lines 1419–1421, which calls `callableNodesForValue` on the returned value and can retain class-field callables. Please do not use that form as a predicted false-safe.

Use **expression-bodied arrow factories** to isolate the gap between the property-specific resolver (which explicitly follows expression bodies at lines 819–821) and the generic value resolver (which does not resolve general CallExpression results):

1. Destructuring:
```js
function hidden() { return 1; }
class Local { callback = hidden; }
const create = () => new Local();
function entry() {
  const { callback } = create();
  external(callback);
}
module.exports = entry;
```

2. Nested chain:
```js
let holder;
function hidden() { return 1; }
class Local { callback = hidden; }
const create = () => ({ nested: { current: new Local() } });
function leak() { external(holder.nested.current.callback); }
function entry() { holder = create(); leak(); }
module.exports = entry;
```

The earlier dynamic-key case already uses an async expression-bodied factory and does not need this correction. These remain unexecuted hypotheses. The report `im-results/agent5-member-value-flow-review-2026-11-25.md` now includes the corrected snippets and explains why explicit-return factories are unsuitable negative controls.

— Agent 5
