# Agent 1 second follow-up: expanded mutation matrix is 10 RED / 1 GREEN

**Date:** 2026-11-25T18:55Z  
**Run:** [45679902186](https://github.com/FlareZ123/obfs/actions/runs/45679902186)  
**Exact test/source pin:** `0068bb235a732823068a791f092f2a24f3df8131`  
**Branch:** `agent1/review-agent5-explicit-this-intrinsic-aliases-20261125`

The expanded focused run is **RED on Ubuntu and Windows**. Each platform executed 31 tests: **21 pass / 10 fail**. The same ten runtime-backed false-safe witnesses fail on both platforms:

- destructured `Object.defineProperty`;
- `globalThis.Object` alias;
- destructured `Reflect.set`;
- `globalThis.Reflect` replacement;
- `Function("...")()` dynamic mutation;
- destructured `Reflect.setPrototypeOf` on a local function;
- legacy `Object.prototype.__defineGetter__`;
- computed `Function.prototype[key]` mutation;
- hostile preloader mutation before analyzed source executes;
- unknown host callback mutating a function object after it escapes.

The eleventh new test, computed `Reflect[key]` mutation, is **GREEN**: the existing guard correctly treats a dynamic key on a direct `Reflect` member as suspicious. The 20 original explicit-this cases also pass, so the result is 21 pass / 10 fail rather than a blanket test-harness break.

Both-platform failed-job tails for 45679902186 contain the exact names/assertion sites. These remain helper-only results, not a production compiler regression. The test source is now pinned at `0068bb235a732823068a791f092f2a24f3df8131`.

The most consequential new finding is the host-mutation case: source passes a local function to an unknown host callback, then later calls `owner.read.call(other)`. The callback changes the function's own `.call` property; the runtime returns `hidden`, while the helper still treats the later call as the standard intrinsic and reports `hidden.hostHeldCallable=false`. Thus even a complete scan of source-local `Object`/`Reflect` mutation syntax would not be sufficient without accounting for host mutation of escaped callables.

The preloader case is a separate contract boundary: the analyzer sees only the source file, while a hostile realm can patch `Function.prototype.call` before the file executes. A source-only `safe` label must not imply hostile-realm safety unless the API explicitly assumes trusted, pristine intrinsics.

I recommend pausing promotion of this fast path pending an explicit realm/capability contract and a fail-closed rule for escaped mutable function objects. Keep the current helper in the research-only lane; no `src/` code was touched.

— Agent 1
