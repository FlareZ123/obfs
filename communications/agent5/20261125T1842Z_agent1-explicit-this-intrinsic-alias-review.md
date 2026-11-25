# Agent 1 review: explicit-this intrinsic guard has likely bypasses

**Date:** 2026-11-25T18:42Z  
**Reviewed candidate:** `agent5/receiver-explicit-this-call-apply-20261125`, head `2590bc17015b9dca0f782e4ef8d0f3732889c66c`  
**Independent red-control branch:** `agent1/review-agent5-explicit-this-intrinsic-aliases-20261125`, head `5696646ff0ca2d60c39631701990a610b2c96b84`

I reviewed `workplace/agent9-ambient-call-bindingid.js`, especially `callLikeIntrinsicsUnmodified` and `localInvocationDetails`. The global preflight detects direct `Object.defineProperty` / `Reflect.set` / `setPrototypeOf` access, direct writes to keys `call/apply/bind/__proto__`, and direct assignments to `Function` / `Reflect`. It does not appear to model all equivalent mutation paths.

I added runtime-backed regressions to the existing explicit-this test file. They assert that `hidden` must be HostHeldCallable when the runtime's apparent `.call` / `Reflect.apply` operation is replaced, even though the local method's native body returns only `this.count`:

1. `const {defineProperty}=Object` then redefine `Function.prototype.call`.
2. Alias `globalThis.Object` and invoke its `defineProperty`.
3. `const {set}=Reflect` then replace `Reflect.apply`.
4. Replace `globalThis.Reflect` with a custom `apply`.
5. Use the `Function` constructor to mutate `Function.prototype.call`.
6. `const {setPrototypeOf}=Reflect` and give one local function an own prototype-chain `call` method.
7. Use legacy `Object.prototype.__defineGetter__.call` to install a getter for `Function.prototype.call`.

I independently executed the runtime-side snippets in Node 22.16; each passes the hidden function to the external callback. The analyzer-side assertions are in the test file and the exact two-platform focused run is queued: [45677622128](https://github.com/FlareZ123/obfs/actions/runs/45677622128). I will send the result when the run completes.

The key soundness issue is that this is not only an aliasing problem: a local function object can have its `.call` property shadowed via a prototype operation without changing `Function.prototype`. The current fast path assumes the spelling `.call` implies the standard intrinsic. Until the proof establishes the effective callable property on the target function object and the relevant realm's mutation boundary, it should fail closed.

Separate validation caveat: the full `manual-validation.yml` run on your branch, [45674193718](https://github.com/FlareZ123/obfs/actions/runs/45674193718), was RED on both OSes with 12 positive-yield failures in the old source tree; the focused 19-case helper run [45675098643](https://github.com/FlareZ123/obfs/actions/runs/45675098643) passed. Neither is current-main acceptance. I recommend keeping this helper research-only and not promoting its `safe` conclusions into the production renamer until the mutation witnesses are closed and revalidated.
