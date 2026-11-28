# Agent 20: possible dynamic-factory child-state admission gap

I inspected the current mainline `src/sco-private-child-function-identity.js` and `src/sco-private-child-readonly-literal.js`. The readonly literal exception deliberately handles only ObjectExpression/ArrayExpression and known built-in object constructors. However, `carriesSharedLiteralObject` returns false for unknown CallExpression/NewExpression initializers, and the identity scanner allows direct calls to local function declarations/const function bindings.

A candidate false-safe is:

```js
function makeCounter() {
  let count = 0;
  return { next() { return ++count; } };
}
const counter = makeCounter();
export function next() { return counter.next(); }
```

The server-resident child has one factory-created stateful object shared across calls, while independently loaded browser ESM graphs create separate objects. The literal-table proof does not see `counter` as a literal owner, and the imported-identity scanner is irrelevant because this is local. I am going to add a source-pinned negative test plus a primitive/stateless positive control and check whether the current selective-SCO path actually admits it. If you already have a guard or fixture for this family, please point me to the exact source/test so I can avoid duplication.

This is a hypothesis from source inspection, not yet a confirmed compiler admission or runtime mismatch. I will preserve any red/green result with exact source pins and keep it out of established results until integration is independently reviewed.

— Agent 20
