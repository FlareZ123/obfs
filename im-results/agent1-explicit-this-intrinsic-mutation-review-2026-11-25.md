# Explicit-this intrinsic mutation falsifiers

**Status:** intermediate adversarial evidence against the research-only explicit-receiver fast path. Not a production `src/` regression, not a security result, and not a full-suite acceptance result.

## Reproduction pins

- Candidate branch: `agent5/receiver-explicit-this-call-apply-20261125`
- Candidate helper: `workplace/agent9-ambient-call-bindingid.js`, reviewed at `2590bc17015b9dca0f782e4ef8d0f3732889c66c`
- Independent red-control branch: `agent1/review-agent5-explicit-this-intrinsic-aliases-20261125`
- Test file: `test/agent5-explicit-this-receiver-call-apply.test.js`
- Expanded test source: `0068bb235a732823068a791f092f2a24f3df8131`
- Initial seven-witness source: `5696646ff0ca2d60c39631701990a610b2c96b84`

## Evidence

The candidate's `callLikeIntrinsicsUnmodified` preflight (helper lines 478–522) detects several direct writes and direct `Object`/`Reflect` mutator accesses. The `localInvocationDetails` fast path (around line 1704) then treats statically recognized `.call`, `.apply`, `.bind`, and `Reflect.apply` as the standard invocation operations.

I added VM-backed tests that first execute the source in Node and verify the external callback receives the actual `hidden` function, then assert that the static summary must classify `hidden` as `HostHeldCallable`.

- [Run 45677622128](https://github.com/FlareZ123/obfs/actions/runs/45677622128), source `5696646f...`: **RED on Ubuntu and Windows**, 27 tests per platform, 20 pass / 7 fail.
- [Run 45679902186](https://github.com/FlareZ123/obfs/actions/runs/45679902186), source `0068bb23...`: **RED on Ubuntu and Windows**, 31 tests per platform, 21 pass / 10 fail.

The expanded run reproduces ten false-safe classifications on both platforms:

1. Destructured `Object.defineProperty` redefines `Function.prototype.call`.
2. A `globalThis.Object` alias reaches `defineProperty`.
3. Destructured `Reflect.set` replaces `Reflect.apply`.
4. Replacing `globalThis.Reflect` changes the later `Reflect.apply` call.
5. The `Function` constructor mutates `Function.prototype.call`.
6. Destructured `Reflect.setPrototypeOf` shadows a local function's `.call` property.
7. `Object.prototype.__defineGetter__.call` installs a getter for `Function.prototype.call`.
8. A computed `Function.prototype[key]` assignment replaces `call`.
9. A hostile preloader changes `Function.prototype.call` before the analyzed source executes.
10. An unknown host callback mutates the `.call` property of a local function after the function escapes to that callback.

The eleventh added test, a computed `Reflect[key]` assignment replacing `Reflect.apply`, is **GREEN**: the current preflight correctly rejects a dynamic key on a direct `Reflect` member. The original 20 explicit-this behavior and precision controls also pass. This distinguishes the failures from a broken runtime harness or blanket refusal.

The most important counterexample is the unknown-host-mutation case. The source passes `owner.read` to a free `mutate` callback. The callback defines an own `.call` property on that function; a later `owner.read.call(other)` returns `other.callback`, which is `hidden`. The helper nevertheless assumes the standard call intrinsic and leaves `hidden.hostHeldCallable=false`.

The preloader case exposes a separate trust boundary. The analyzer sees only the source file, but the VM realm is modified before that file executes. A source-only analysis cannot prove that the host realm's `Function.prototype.call` or `Reflect.apply` remains pristine.

## Interpretation and limits

The observed gap is in the **research helper's proof precondition**, not in the production compiler. The helper is not integrated into `src/` or `bin/`. The focused run failed during the test step, so the subsequent strict JSDoc steps were skipped; a separate green focused run is pending to check the complete external JSDoc set.

The evidence shows that direct mutation scanning is insufficient for an unconditional claim that the spelling `.call`/`.apply`/`.bind` denotes the standard intrinsic. Destructuring, global-object aliases, dynamic code, legacy descriptor APIs, prototype mutation, and host mutation of escaped functions bypass the current preflight. It also shows that a source-only proof needs an explicit pristine/trusted-realm precondition if it assumes built-in intrinsics have not been modified before execution.

For hostile COO/SNO environments, the analyzer must not infer a trusted realm from the absence of mutation syntax in one source file. A future design should either make the trusted-intrinsics precondition explicit in the API and exclude hostile-runtime claims, or fail closed for affected call sites. In particular, a function object handed to an unknown host callback cannot safely retain a future standard-`.call` assumption without a proof that the callback cannot mutate it. A complete source-local alias analysis alone cannot solve pre-execution realm mutation.

This is bounded to the reviewed helper snapshot and the ten tested shapes. It does not exhaustively cover all JavaScript reflection, proxies, module aliases, preloaded hooks, or browser host objects. No conclusion about the production renamer or emitted code follows. The repository's overall strong-protection release remains **RELEASE-BLOCKED** per `results/README.md`.
