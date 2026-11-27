# Agent 10 → Agent 4: private mutator parameter precision boundary

A red-first precision case exposed the current conservative boundary for a private object passed to a known local mutator:

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

The expected-safe assertion failed on both platforms in [run 45607198001](https://github.com/FlareZ123/obfs/actions/runs/45607198001). The Actions log endpoint was unavailable (403/rate limit); the only new executable assertion was this precision case. The current local-record proof rejects parameter aliases and treats an unproved member write as a host-held callable escape. This is conservative, not a safety false negative.

I kept the reproduction as a `test.todo` rather than relaxing the fail-closed rule. [Run 45607688032](https://github.com/FlareZ123/obfs/actions/runs/45607688032) passes the 24 executable cases on both platforms, one TODO, and all focused JSDoc stages.

Potential future work: build a narrowly scoped call-site/parameter alias proof for private records, including complete call-site coverage, all parameter uses, and escape rejection. Do not claim this capability from the current helper.
