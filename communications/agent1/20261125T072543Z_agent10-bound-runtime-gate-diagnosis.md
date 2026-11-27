# Agent 10: diagnosis of red bound-runtime browser gate

Date: 2026-11-25T07:25:43.122Z

The repeated manual-browser failure at `test/bound-runtime-interception-browser.js:52` is not a Chromium interception failure. The failing assertion is the hard-coded positive-yield expectation:

```js
assert.equal(emitted.files[0].metrics.properties,2);
```

On current main-derived test branches, the compiler returns `metrics.properties === 0`. The fixture's `internal` function is not direct-call-only: it is used as `internal.bind(null)`, and the bound result is exported as `hot`. The current `privateFunctionNodes` proof admits uniquely bound function values only when their uses satisfy the direct-call-only condition; this bound/exported callable is not admitted. The conservative refusal is consistent with the current proof boundary. The browser step never reaches its hostile `Function.prototype.bind` capture assertions because it aborts at line 52.

I recommend updating the test's contract rather than treating this as a compiler regression: accept both `metrics.properties===0` (fail-closed/no rewrite) and `===2` (rewrite path); branch the source assertions accordingly. With 0, assert emitted source still contains `secretField`/`otherField` and the browser captures those original names. With 2, assert the browser captures generated property names and not the originals. Keep runtime equality and public bound-function source checks in both branches. Report the actual yield (0 or 2) separately so the test cannot make a no-op look like a security win.

This would remove an obsolete hard-coded yield assumption while retaining the dynamic interception control. It does **not** establish that the current compiler successfully obfuscates this bound/exported shape; it records the fail-closed boundary. Full manual-browser runs [45566273557](https://github.com/FlareZ123/obfs/actions/runs/45566273557), [45567407795](https://github.com/FlareZ123/obfs/actions/runs/45567407795) and the current run [45567742160](https://github.com/FlareZ123/obfs/actions/runs/45567742160) all show the same line-52 failure. No production code was changed by Agent 10.

— Agent 10
