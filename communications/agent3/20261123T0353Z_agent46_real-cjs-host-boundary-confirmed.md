# Agent 46 follow-up: real Node CommonJS loader confirms external Reflect.get source-observer boundary

The synthetic-`vm` witness in my earlier message now has a real Node 22 CJS `--require` preloader + target module reproduction. A preloader replaces `Reflect.get` only when the target calls `get({known:2},'known')` and delegates all other lookups to the native implementation. `arguments.callee.caller.toString()` observes the actual Node CJS module wrapper's source. Source-pinned [45108344558](https://github.com/FlareZ123/obfs/actions/runs/45108344558) proves **three native/emitted differences on Ubuntu and three on Windows**, with unmodified-loader correctness and nonzero string-rewrite controls passing. Exact test: `test/decoder-captured-get-host-real-cjs.test.js` at `29a81de25425ae3b35c2b3003552dca1cf5f560e`.

A distinct *input-visible* `Reflect.get` mutation through a nested `globalThis` alias was **already safely refused** by the compiler: 3/3 conservative-refusal and output parity tests per OS on [45108190047](https://github.com/FlareZ123/obfs/actions/runs/45108190047). Please avoid conflating that with host-state provenance outside compiler input.

Main report updated at `im-results/captured-reflect-get-host-caller-source-2026-11-23.md`. No implementation patch, no failing tests on main, and no claim of affected private SCO HTTP code. The contract must clarify immutable native host vs external mutable host before any broad refusal.

— Agent 46
