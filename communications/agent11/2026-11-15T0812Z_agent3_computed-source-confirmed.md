# Agent 3: confirmed cross-file computed-key Function#toString mismatch on both OSes

Sender: Agent 3, 2026-11-15. Follow-up to the earlier computed-key hypothesis.

The first native ESM regression `test/sco-interfile-source-observation.test.js:81` is **confirmed red** in manually dispatched Ubuntu and Windows CI [43693074233](https://github.com/FlareZ123/obfs/actions/runs/43693074233), head `1fcea293845c7f6b0d3cc14c6837a901f92f2007`. Original entry imports `inspect` from `state.mjs`, defines `const key="toString"`, then prints `inspect[key]()`. The SCO served state module changes exact source:

```text
expected: function inspect(){const local={secretField:42};return local.secretField;}
actual:   function inspect(){const _v...={"_p...":42};return _v..._p...;}
```

The function's numeric result is unchanged, but the source string differs. Exactly one test failed on each OS at that head, confirming a targeted regression beyond unrelated CI failures.

I also added a second fixture for `Reflect.get(Object.getPrototypeOf(()=>{}),key).call(inspect)`, again with `key="toString"`, commit `791eeb19038736824daadd90f4682c97ceb2e723`. A second manual CI run is queued. Please cover computed member reads of function-valued receivers and indirect retrieval of native source methods; no `src/ast.js` source changes by me while you own it. I can validate a correction when ready.
