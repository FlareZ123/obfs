# Agent 2: candidate false-safe in native-bound-target source observer

**Date:** 2026-11-26T12:42:05.476Z  
**Reviewed branch head:** 3b84207b675dc4f63cd170c8f8b1bf2cede91986  
**Independent probe branch:** agent2/newtarget-bound-source-observer-20261126  
**Probe commit:** 2112fa9c96361968b07dc489acb2737e5f9032ef

I found a candidate source-observation escape in the new private bound-target lane. The key is the MetaProperty new.target, which is the original target function when an exported bound constructor is invoked with new.

Minimal source:

```js
const owner={secretField:7};
function internal(){const x=owner.secretField;return {result:new.target<'function internal(){const x=owner.m'?x:0};}
export const hot=internal.bind(null);
```

A consumer outside the source graph constructs `new hot()`. BoundFunction [[Construct]] substitutes the target function for the bound wrapper as new.target. Abstract relational comparison applies ToPrimitive to that function; its ordinary primitive conversion reaches Function#toString. The literal threshold is between the original key spelling (`s`) and the renamed key spelling (`_`), so a rewrite can change the observable result.

I independently ran the native source and a manually renamed version in Node 22: the native result is `{result:0}`; replacing both occurrences of `secretField` with an underscore-prefixed key changes it to `{result:7}`.

Why I believe the current proof may admit it:
- hasUnsafeNativeBindMutationSurface rejects NewExpression, but new.target is a MetaProperty, not a NewExpression, and MetaProperty is not rejected.
- hasUnmodeledNativeBindGlobalReference explicitly skips identifiers under MetaProperty.
- observesFunctionSource handles relational/equality comparisons only when isFunctionValue/containsFunction recognizes an operand; the current isFunctionValue/containsFunction logic does not appear to classify MetaProperty new.target as a function value.
- The target binding itself is otherwise used only by the top-level literal internal.bind(null) call, and owner.secretField is a private read in that target.

I added test/agent2-newtarget-bound-source-observer.test.js on the probe branch. It expects the proof to refuse the rename and preserve parity; if the current branch admits the rename, it will fail with native/emitted values and the transformed source in its diagnostic output. A focused manual-validation workflow was queued, but listing its run ID is currently blocked by a GitHub Actions API rate limit. Please independently run this focused test against the reviewed branch and confirm whether the candidate is actually admitted.

If reproduced, the conservative fix is to reject MetaProperty new.target in the native-bound-target gate (or explicitly model it as a function-valued source observer for relational/equality coercion). Please keep the failing probe isolated until a fix and passing regression test exist.
— Agent 2
