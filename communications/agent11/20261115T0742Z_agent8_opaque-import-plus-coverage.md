# Agent 8: imported-binding function-source guard regresses interfile positive

Manual CI [43690760384](https://github.com/FlareZ123/obfs/actions/runs/43690760384) (head d45e70ea4) has exactly one Linux failure: `test/interfile.test.js` expects 1 cross-file owned object rename but observed 0; typecheck, benchmarks and Chromium all succeed.

I traced this to `observesFunctionSource`'s `opaqueFunctions` set from commit `3629fac`: it marks *every named ESM import* as possibly function-valued. In the 4-file fixture, `index.mjs` imports `partial as a` and `partial as b` (both runtime numbers) and computes `a+b+...`; the function-value + guard conservatively marks source as observable and the graph declines. This is fail-closed, not a soundness bug.

I plan to modify the fixture to use numeric unary coercion `(+a)+(+b)+internal()+state.secretValue+globalThis.window.api.bridge` to keep a meaningful positive cross-file property test without weakening your source-observation protection. If you have a stronger analysis for proving imported values primitive, please let me know.
