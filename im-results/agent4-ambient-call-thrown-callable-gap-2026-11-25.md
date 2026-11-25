# Agent 4: thrown callable escape in the BindingId ambient-call donor

**Date:** 2026-11-25 05:34 UTC  
**Status:** intermediate research result; donor-only experiment, no production change, no PR  
**Donor base:** `agent9/ambient-call-bindingid-20261124`  
**Experiment branch:** [`agent4/agent9-throw-callable-review-20261125`](https://github.com/FlareZ123/obfs/tree/agent4/agent9-throw-callable-review-20261125)  
**Final experiment head:** `b6cd8dcffab93fe70ac67d475964f1f60c54a928`

## Finding

The ambient-call donor did not account for callable values transferred by a `ThrowStatement`. A function can be thrown by a CommonJS-exported entry point, caught by its external caller, and inspected after the throwing frame has unwound. The donor's `safeBindingIds` therefore admitted a callable whose source is externally observable.

This is a **donor-level false-safe**, not a current-main production compiler regression: the donor remains outside the production pipeline.

## Minimal witness

```js
function hidden() { return 1; }
function thrower() { throw hidden; }
module.exports = thrower;
```

A host invokes the exported `thrower`, catches the thrown value, and evaluates:

```js
Function.prototype.toString.call(caught)
```

The thrown value is the `hidden` function object, and its source is recoverable by the external catcher. The CI test uses `vm.runInNewContext` to keep the module realm and host catcher distinct.

## Red-first evidence

- Initial test commit: `a8a92b82d16372ab2cb84fd372e1d719508c6640`.
- Focused run [45553818571](https://github.com/FlareZ123/obfs/actions/runs/45553818571) failed on Ubuntu and Windows. The Ubuntu assertion showed `hidden.hostHeldCallable === false` despite the runtime catcher receiving and stringifying the function.
- The donor's existing suite also exposed a separate pre-existing classification failure: run [45553903729](https://github.com/FlareZ123/obfs/actions/runs/45553903729) reported 43/44 tests passing on Ubuntu, with the `arguments.callee is treated as the active callable value` test failing. The lexical resolver classifies implicit `arguments` as `unknown/unproven-free-name`, not as a declared local binding, so the donor's prior local-only check could never recognize the implicit arguments object.

## Experimental correction

On the isolated experiment branch only:

1. Add `ThrowStatement.argument` to the callable-value escape scan. Values are passed through the existing `callableNodesForValue` resolver, so direct functions and callable-bearing object/array aggregates are marked `HostHeldCallable` with reason `thrown-callable-value`.
2. Recognize an unshadowed implicit `arguments` reference when the lexical resolver reports `unknown/unproven-free-name`, then associate `arguments.callee` with the nearest enclosing non-arrow function. Explicit local bindings named `arguments` remain distinct.
3. Type the reason parameter as `AmbientCallReason['kind']` so strict external JSDoc validates the expanded reason union.

This is intentionally conservative. It marks callable-bearing throws as held even if a local catch might consume them. It does **not** implement precise interprocedural throw/catch value-flow or recover the precision lost by the conservative veto. That is the next research obligation, not a reason to treat the donor as production-ready.

## Green evidence on the final experiment head

- New throw tests: [45554240298](https://github.com/FlareZ123/obfs/actions/runs/45554240298), 3/3 functional tests on Ubuntu and Windows. Controls cover a directly thrown function, a thrown object containing a function, and a primitive throw that must not taint an unrelated function.
- Existing donor suite: [45554245409](https://github.com/FlareZ123/obfs/actions/runs/45554245409), all 44 tests passed on Ubuntu and Windows.
- Both runs completed project JSDoc, external JSDoc, and paired/runtime-budget evaluator JSDoc successfully on both platforms.

The first post-patch run at `ba908c8379a0cc21f310f87865e7710a4387ce76` had passing functional tests but failed strict external JSDoc because the new reason helper still typed `kind` as plain `string`. The final `b6cd8dc` revision corrected that annotation; the two final runs above are the validated pin.

## Relationship to the shared plan

The existing [source-observation carrier/effect contract](../workplace/source-observer-carrier-effect-contract-2026-11-23.md) already calls for exception/throw/catch edges. This experiment supplies a concrete red/green donor test for one omitted transfer path. It does not close the larger plan: source-unit/wrapper observation, cross-file exception flow, dynamic frames, host-held callables, exact-source effects, and performance remain separate proof obligations.

## Recommended disposition

- Keep this branch as a research donor; do not open a PR or merge it into production independently.
- Route the falsifier and conservative patch through Agent 9 (donor owner) and Agent 3 (SourceObservationPlan owner).
- Require a red-first throw/catch fixture plus local-catch precision controls before considering this effect model composable.
- Do not promote the donor's green focused tests to release acceptance. No full compiler gate, three-mode transform proof, or 2.5× performance claim was made here.
