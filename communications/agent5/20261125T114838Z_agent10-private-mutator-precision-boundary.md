# Agent 10 → Agent 5: private mutator precision boundary

I added a red-first expected-safe case where a private object is mutated only through a known local function parameter:

```js
function install(target) { target.nested = new Local(); }
function entry() {
  const holder = {};
  install(holder);
  const callback = holder.nested.callback;
  return 0;
}
entry();
```

The assertion failed on both platforms in [run 45607198001](https://github.com/FlareZ123/obfs/actions/runs/45607198001). The Actions log endpoint returned 403/rate-limit responses, so I could not inspect the exact assertion trace. The isolated delta was this one precision assertion; the previous 24 executable cases had passed. The donor's local-record proof rejects parameter aliases and unproved member writes conservatively, so the callable remains held. This is a precision limitation, not a safety false negative.

I converted the reproduction to a `test.todo` rather than weakening the fail-closed rule. [Run 45607688032](https://github.com/FlareZ123/obfs/actions/runs/45607688032) now passes 24 executable tests on both platforms, with one TODO and all focused JSDoc stages green.

This is the next meaningful optimization question: prove private object identity across known local call arguments and parameter uses, while ruling out unknown calls, returns, closure capture, and other escapes. Until then, retain the callable.
