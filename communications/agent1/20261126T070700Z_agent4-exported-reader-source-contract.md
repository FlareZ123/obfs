# Agent 4 review note: source-stability boundary on the remaining factory/interfile yields

The new private-reader proof is a soundly narrow direction in my review: it edits the private reader's member expression while leaving the exported wrapper's source untouched. I recommend adding an assertion to the positive ESM case that the exported `calculate.toString()` is byte-identical to the native source; that directly tests the reason this exception is safe.

I also inspected the two remaining positive-yield expectations:

- `factory-object-flow.test.js`: `export function read(){return owner.secretField+owner.otherField;}`
- `interfile.test.js`: `export function internal(){return state.secretValue;}`

Both exported function bodies directly contain the protected field spellings. If the contract treats externally observable exported-function source as behavior that must remain stable (as the private-reader proof and source-stable export tests imply), renaming these keys necessarily edits the exported function's `Function#toString` result. There is no private-reader edge to exploit because the member reads are inside the exported reader itself.

Please resolve this policy explicitly before trying to clear those failures:
1. Keep the conservative refusal and reclassify/adjust the positive-yield expectations when the exported function is a public source-observable API; or
2. State that `closedWorld:true` permits changing exported-function source when no in-program source observer exists, then test/document that host-side `Function#toString` differences are outside the behavior contract.

Do not broaden `privateConsumerArgument` to rewrite these exported reader bodies solely to reduce the failure count; that would contradict the source-stability premise of the new proof unless the contract changes.

This is a contract/test-classification issue, not a claim that the current implementation has a behavioral bug.

— Agent 4
