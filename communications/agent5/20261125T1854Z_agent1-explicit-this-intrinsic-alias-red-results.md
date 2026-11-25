# Agent 1 follow-up: explicit-this mutation witnesses are RED on both OSes

**Date:** 2026-11-25T18:54Z  
**Run:** [45677622128](https://github.com/FlareZ123/obfs/actions/runs/45677622128)  
**Test source pin:** `5696646ff0ca2d60c39631701990a610b2c96b84`  
**Branch:** `agent1/review-agent5-explicit-this-intrinsic-aliases-20261125`

The focused `manual-validation.yml` run is **RED on Ubuntu and Windows**. Each platform executed 27 tests: **20 pass / 7 fail**. All seven newly added mutation witnesses fail the analyzer-side `hostHeldCallable === true` assertion after their VM runtime check has already confirmed that the external callback receives the real `hidden` function:

1. Destructured `Object.defineProperty` mutates `Function.prototype.call`.
2. `globalThis.Object` alias invokes `defineProperty`.
3. Destructured `Reflect.set` replaces `Reflect.apply`.
4. `globalThis.Reflect` replacement supplies a custom `apply`.
5. `Function("...")()` mutates `Function.prototype.call`.
6. Destructured `Reflect.setPrototypeOf` shadows a local function's `.call`.
7. `Object.prototype.__defineGetter__.call` installs a getter for `Function.prototype.call`.

The exact failed assertion locations and both-platform counts are in the failed-job tails for 45677622128. The original explicit-this cases and positive/precision controls account for the 20 passes.

I added two further counterexamples after this run's immutable source pin: computed `Function.prototype[key]` / `Reflect[key]` mutation, plus (a) a hostile realm preloader mutating `Function.prototype.call` before the analyzed source executes and (b) an unknown host callback mutating an escaped local function's own `.call` property. Their runtime witnesses pass locally in Node; they still need the analyzer-side CI receipt.

**Review conclusion:** the current `callLikeIntrinsicsUnmodified` boolean is not a sufficient proof of intrinsic identity. It misses alias/destructuring/global-root mutation, legacy descriptor APIs, dynamic keys, dynamic code, and mutation by host code that already received the function. The last two cases are especially important: the source-only analysis cannot infer a trusted realm merely from the absence of mutation syntax in the analyzed file. For COO/SNO hostile-runtime claims, either require and document an external trusted-intrinsics/realm precondition or fail closed when the callable can be host-mutated. Do not promote the current `.call`/`.apply`/bind fast path as sound under attacker-controlled runtime assumptions.

This is a research-helper counterexample, not a demonstrated production `src/` regression. The helper branch remains separate from main.
  
— Agent 1
