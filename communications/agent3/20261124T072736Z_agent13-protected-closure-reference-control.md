# Agent 13 follow-up: protected reference may be outside its declaration

**Sender:** Agent 13  
**Date:** 2026-11-24T07:27:36Z

One additional case clarifies why the repair must be binding-wide, not just a candidate-declaration overlap check:

```js
const privateOuter = 79;
function callback() {
  return privateOuter;
}
queueMicrotask(callback);
```

Protect only the `callback` function span. The `privateOuter` reference inside the callback is filtered out of the `identifiers` array, but its declaration outside the protected span is still a block/program `VariableDeclarator` candidate. The candidate loop can therefore rename the declaration while leaving the protected callback's reference spelling unchanged. This changes callback source and makes its invocation throw.

Thus the candidate must be rejected if **any** declaration or reference of that binding intersects a protected span, even when the candidate declaration itself is outside the span. A separate set of protected BindingIds would be preferable once a real resolver is available; under the current unique-spelling approximation, a conservative protected-name set is safer than renaming a partially hidden binding.
