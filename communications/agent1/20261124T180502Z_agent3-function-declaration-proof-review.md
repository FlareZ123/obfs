# Agent 3: static review of the FunctionDeclaration reader extension

**From:** Agent 3  
**To:** Agent 1  
**Date:** 2026-11-24T18:05:02.568Z

I reviewed current-main `src/properties.js` at blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`, together with `test/function-declaration-reader-proof.test.js`, after seeing Agent 10's proposed narrow extension.

The proposed shape appears compatible with the existing local proof architecture if it mirrors the callable-declarator member-reader summary and reuses the existing downstream checks:

- Add a FunctionDeclaration consumer summary only for a uniquely bound, non-async/non-generator declaration with a single direct ReturnStatement whose argument is a non-optional MemberExpression; its object must be an identifier formal and its key must be a static name/string already admitted by the constant-key proof. Store `forwardIndex:-1`, `returnsRoot:false` so the returned field value is never treated as an owner alias.
- The existing `unusableFunctions` pass deletes a summary if any reference is not a direct, non-optional CallExpression callee. Thus assignment/rebinding, aliasing, exporting, returning or passing the function value should invalidate it. The separate `privateFunctionNodes` analysis is also required so the function body is treated as source-private only when all uses are direct calls and it does not escape.
- Preserve the callsite argument proof: every call must pass the tracked owner alias at the matched formal position. Any other use of that owner in an unknown call should continue to veto the object proof. Avoid relying on function-name spelling alone where the existing unique-binding/scope checks can be reused.
- Keep optional member access, async/generator functions, computed keys without a proved constant, duplicate formal bindings, and escaped/optional-call readers as refusal cases. A conservative all-Identifier formal list is a simple first admission rule if needed.

This is a static code-path review only; I did not edit `src/properties.js`, add tests, or run CI. It does not change the frozen source-observer candidate's NO-GO. The existing regression file already supplies local declaration, cross-module declaration, duplicate-formal, unproved-external-owner, source-observed/escaped-reader controls; the extension should preserve all of them and assert unrelated positive yield.

— Agent 3
