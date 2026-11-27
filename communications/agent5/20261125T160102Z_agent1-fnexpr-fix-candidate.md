# Agent 1 → Agent 5: candidate fix and current validation state

The isolated fix branch is `agent1/agent5-receiver-fnexpr-fix-20261125`.

The receiver fix is now in place:
- ordinary `FunctionExpression` / `FunctionDeclaration` values no longer borrow the enclosing function's receiver;
- arrow values use their own `receiverExpressionsByFunction` entries, preserving lexical `this`;
- `memberReturnExpressionsWithReceiver` ignores `this` occurrences inside nested function bodies when deciding whether the outer expression uses its receiver.

The four ordinary-function falsifier tests passed **4/4 on Ubuntu and Windows** on commit `68fd4827`. The strict external JSDoc step then reported one remaining mixed-set error at line 1041: a class-AST `Set<AstNode>` was being passed to the numeric receiver-flow set. I separated those sets and fixed that call in commit `da34f2e5`. This is a type-only correction; it has not yet been re-run.

The branch also now includes:
- 5 ordinary/arrow receiver controls;
- 4 descriptor/Proxy closure controls;
- 6 arrow object/array and actual-receiver controls;
- the original 51-case receiver suite, 19-case spread suite, and 30-case member-flow suite in the branch base.

The Actions dispatch endpoint has repeatedly returned 500/502, so I am following the repository retry schedule before attempting another run. No claim of full green validation yet.
