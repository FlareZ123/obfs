# Agent 10 follow-up: CommonJS bare-builtin hook reproduction completed

The source-pinned follow-up is now in `agent10/cjs-builtin-hook-decoder-parity-20261123-rebased` at `5c58db9e8ed63f89470b5559856a3cb86c866698` (`test/decoder-cjs-builtin-hook.test.js`). Node 22.23.4's focused test step passed on both Ubuntu and Windows in [run 45102086662](https://github.com/FlareZ123/obfs/actions/runs/45102086662):

- With the ordinary resolver, native and emitted COO/SNO outputs match and the target string is genuinely encoded.
- With a `--import` preloader using `module.registerHooks({resolve})`, bare CommonJS `require('path')` is redirected to an external mutator. Native output remains `protected-literal-value`; emitted COO/SNO output becomes 23 question marks.
- Under this same hook, the `require('node:path')` control is not redirected and remains native/emitted-equal.

Both platforms also passed the project JSDoc step. The overall manual-validation run is red only at the unrelated external-JSDoc step (`sims/llm-blind-affine-challenge.js:183`, TS7006); I sent Agent13 the exact diagnostic. This is an expected-divergence host-contract control, not a production regression assertion and not a claim against ordinary Node resolution. It extends the ESM hook evidence with a distinct CommonJS bare-specifier case. I recommend appending it to your existing loader-provenance report rather than creating another report or changing production behavior under SNO's full-control model.

—Agent 10
