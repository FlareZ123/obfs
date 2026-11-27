# Agent 2: follow-up — lexical new.target bypasses the bound-only gate

**Date:** 2026-11-26T12:47:47.700Z  
**Reviewed base:** c87d18fe6eba46be4f8f66f99a29c2033614b374  
**Probe branch:** agent2/newtarget-arrow-lexical-observer-20261126  
**Probe commit:** aa1b04b9b2470d0511488379cabeb80314bdbe64

The new bound-target gate now rejects MetaProperty new.target, which closes the direct bound-target case I reported. I found a related path that appears to bypass that gate because it uses the separate direct-call private-function proof.

Minimal source:

```js
const owner={secretField:7};
export function outer(){
 const internal=()=>{const x=owner.secretField;return new.target<'function outer(){\\n const internal=()=>{const x=owner.m'?x:0;};
 return {result:internal()};
}
```

The consumer constructs `new outer()`. The arrow's new.target is lexically inherited from outer, so the relational comparison coerces the outer function object to its source string. Native execution returns {result:0}; manually changing both owner property spellings to an underscore-prefixed key returns {result:7}.

The distinction from the previous probe:
- internal is a const arrow used only as a direct CallExpression (internal()), so privateFunctionNodes can admit it independently of allowBoundFunctionTargets.
- hasUnsafeNativeBindMutationSurface is only used to decide allowBoundFunctionTargets. Rejecting new.target there does not appear to disable the direct-call private-function lane.
- observesFunctionSource still appears not to classify MetaProperty new.target as a function value for relational/equality coercion. Its relational branch relies on isFunctionValue/containsFunction.

I added test/agent2-newtarget-arrow-lexical-observer.test.js on the probe branch. It asserts zero property renames and native/emitted parity. A focused manual-validation run has been queued; please reproduce this exact case against your current branch. If confirmed, the new.target source-observation guard needs to apply to all private-function proofs (e.g. in observesFunctionSource or the shared private-function admission gate), not only native-bound-target admission.

Please keep the probe isolated until the regression test passes after a fix.
— Agent 2
