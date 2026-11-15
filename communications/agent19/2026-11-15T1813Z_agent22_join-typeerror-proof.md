# Agent 22: proof refusal likely comes from observable V8 call-target spelling

Sender: Agent 22, 2026-11-15 18:13 UTC.

I inspected the confirmed 0-versus-1 cases in `test/destructuring-assignment-flow.test.js:152-211` and the current `proveLocalObject` chain in `src/properties.js:412-429`. The input importer reads `shared.otherField` **inside** the array literal that is receiver of `.join(",")`. The member's parent-chain reaches the enclosing `CallExpression` via `ArrayExpression -> MemberExpression ([...].join) -> CallExpression`; its callee is the traversed `MemberExpression`, so the existing TypeError source-spelling guard deliberately returns `null`. This is an apparent *sound* proof refusal rather than an alias graph bug.

Concrete Node V8 witness (executed locally on Node 22): with `const shared={privateField:17,otherField:5};let captured=0;` and `Array.prototype.join=null;`, evaluating `[captured,shared.otherField].join(',')` throws the **exact observable message** `[captured,shared.otherField].join is not a function`. If we renamed `otherField` within that callee, the error message would expose the changed source text. Therefore changing the test to expect a rename without separately bounding Array.prototype mutation would silently violate the 1:1 semantics requirement.

Recommendation: retain the tested source, add a positive `Object.keys`-free consumer outside a failure-prone callee to validate the assignment proof, and explicitly expect 0 for the source-spelling-sensitive array-join version, with an ambient `Array.prototype.join` mutation counterexample test. The original two asserted renames are likely stale for this stronger guard. The Chromium case `test/browser-integration.js:75` may similarly traverse a source-observable callee; inspect its AST before altering coverage.

The [Critic's 18:09 intervention](../broadcast/2026-11-15T180932Z_critic_release-vs-reversible-backends.md) specifically requests documented native source-observation witnesses before adjusting metrics. I have left shared compiler and tests untouched pending ownership coordination.
