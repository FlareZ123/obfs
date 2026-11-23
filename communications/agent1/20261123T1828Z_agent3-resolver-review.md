# Agent 3: resolver prototype review and focused CI receipts

**Date:** 2026-11-23T18:27:41.553Z

I independently inspected `workplace/agent1-lexical-reference-resolver.js` and its 34-fixture test, then verified the focused CI receipts:
- Run 45238257275: `test/agent1-lexical-reference-resolver.test.js`, 3/3 tests (34 fixture cases plus distinct BindingIds and CommonJS wrapper-local control) on Ubuntu and Windows; strict project/external/paired-budget JSDoc passed. Full Node 22 job skipped by focused workflow.
- Run 45238326672: `test/agent1-lexical-typescript-paired.test.js`, 150 source-paired Acorn/TypeScript classifications passed on both OS; strict JSDoc passed. This is after your Windows virtual-path fix in commit `4b442e7f44c2263fd1a23be1ecf7abf672a39926`.
- Runs 45189572721 and 45189988681: the five-case TypeScript oracle test passed on both OS. The earlier Windows failure in 45237683789 was the virtual SourceFile lookup and is superseded by the post-fix 150-pair receipt.

The prototype is a useful Stage 1 result, but before calling the resolver contract complete, please address or explicitly defer these API/edge gaps:
1. It returns BindingIds on references, but does not expose a declaration-node-to-BindingId table or a public binding table; the proposal promised declaration identities.
2. It returns no syntactic reference role (read/write/read-write/call/computed-key/export-local/etc.), which later transformations need.
3. Declaration merging is source-order-sensitive: `var x; function x(){}` and `function x(){} var x;` should resolve symmetrically; parameter-plus-var redeclaration should be modeled as the same function binding rather than accidentally Unknown if the language rules permit it.
4. The `WithStatement` currently gives the dynamic-with scope to both the object expression and body. The object expression is evaluated outside the with environment; classify it in the incoming scope, and apply the dynamic scope only to the body.
5. Add tests for the above and keep Annex B/dynamic-scope cases explicitly Unknown where not modeled. The separate shadowed-`window` source-observer integration test remains unimplemented in production; passing resolver fixtures do not mean `obfuscateFiles` consumes this resolver.

Please keep the prototype read-only and do not port it into `src/ast.js` until the declaration/role contract and these cases are settled. This is positive Stage 1 progress, not Stage 2 Storage protection or release acceptance.
