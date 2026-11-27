# Bounded private-reader consumer proof

**Status:** intermediate result; implementation is integrated into draft PR #379, but the release gate remains red.

## Finding

A local object can be renamed when its only use inside an otherwise exported caller is to pass it as the sole argument to a proven private reader. The exported caller's source then contains the owner binding and helper call, not the private property spelling. The caller itself is not marked private; only this exact argument edge is admitted.

The proof in `src/properties.js` requires all of the following:

- The call is direct, non-optional, and has exactly one argument.
- The callee resolves to a local function in the proof inventory, not an external/imported consumer.
- The reader has exactly one identifier parameter, is non-async/non-generator, and is in `privateFunctionNodes` (direct-call-only and nonescaping).
- The reader is not an identity/owner-forwarding function (`forwardIndex === -1`, `returnsRoot === false`).
- The parameter is already in the tracked owner-alias set.
- The complete reader body is one of the narrow supported forms:
  - direct static member return;
  - arrow expression body returning a static member;
  - exactly `const value = owner.staticKey; return value;`, with a unique local binding and exactly the declaration/return identifier uses.
- The member read is non-optional and non-computed, and its object is the exact reader parameter.

Other body shapes, side effects, unknown calls, optional calls, multiple parameters, dynamic keys, escaping/source-observed readers, and exported readers remain fail-closed.

## Regression coverage

`test/function-declaration-reader-proof.test.js` covers:

- A three-module native ESM graph in which exported `calculate` passes a private owner to local `readAlpha` and `readBeta` FunctionDeclarations.
- The public-only normalization fixture, whose private arrow reader uses a local `const` temporary.
- Negative controls for side-effecting multi-statement readers, identity forwarding, multiple parameters, optional calls, and side-effecting arrow readers.
- Existing source-observed and escaped reader refusals.

The change does not relax `factory-object-flow` or `interfile`: their exported readers directly contain the protected member spellings and remain outside this proof.

## Reproducible validation

- Focused run [4260](https://github.com/FlareZ123/obfs/actions/runs/45770780738): passed on Ubuntu and Windows.
- Full run [4261](https://github.com/FlareZ123/obfs/actions/runs/45770900106), code/test tree commit `6d741d2d58301425af2460b5e8d9aea3dacf0943`:
  - Ubuntu: 5,391 tests; 5,357 passed; 9 failed; 25 skipped.
  - Windows: 5,391 tests; 5,356 passed; 9 failed; 35 skipped.
- Baseline full run [4253](https://github.com/FlareZ123/obfs/actions/runs/45768179948), main pin `20cf9ff08dada0d06b5ecf4870cb15699d8cecad`:
  - Ubuntu: 5,390 tests; 5,354 passed; 11 failed; 25 skipped.
  - Windows: 5,390 tests; 5,345 passed; 11 failed; 34 skipped.

Both `function-declaration-reader-proof` failures disappeared on both operating systems, with no new failure introduced. The remaining nine failure groups are:

1. `bound-runtime-interception`
2. `bound-runtime-minifier-control`
3. `factory-object-flow`
4. `interfile`
5. `private-class-source-yield` (COO)
6. `private-class-source-yield` (SNO)
7. `private-tuple-session`
8. `sno-bound-runtime-interception`
9. `source-stable-bound-export`

JSDoc/type checks, browser suites, and the 2.5x performance gate passed in run 4261. The largest observed benchmark ratio was 1.245x.

The implementation has since been ported into draft PR #379 at `88c66048c01dde3ba54fbf1b2da14f65d490c087`; full integrated-candidate run [4262](https://github.com/FlareZ123/obfs/actions/runs/45772098857) is pending.

## Limits and next work

This is a conservative property-renaming yield improvement, not evidence of resistance to static reconstruction, dynamic instrumentation, or runtime extraction. Do not broaden the proof to exported readers, callbacks, imported functions, multi-property readers, or arbitrary function bodies without corresponding alias/escape analysis and negative controls. Review the integrated PR result and retain the nine remaining failure groups as separate investigations.
