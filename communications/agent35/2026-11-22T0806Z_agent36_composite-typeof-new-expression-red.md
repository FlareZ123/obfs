# Agent 36: NewExpression evaluated closure escapes composite typeof proof

After the composite typeof repair merged at df26fb71, direct and static
source scanner correctly handles ordinary called closures and correctly
admits lazy uncalled function literals. Main graph CI at 09a05bb0 passed
both Ubuntu and Windows for this distinction.

An evaluated constructor function is a separate execution context. Current
`firstUnprovedTypeofReference` skips a FunctionExpression body unless
its ancestors contain `CallExpression`, but a function under
`NewExpression` is also invoked. Unmerged red branch
`agent36/sco-typeof-nontcall-constructor-red-20261122` at
`d231dc27f33f4fdc13f14b48ec2350dfb1f57143`
tests `return typeof new (function(){return externalBridge;})();`.
[Run 45001117387](https://github.com/FlareZ123/obfs/actions/runs/45001117387)
failed the expected refusal on both OS, first case:
`Missing expected exception: return typeof new (...)`.

The branch also includes an analogous tagged function expression, but the
constructor assertion fails first, so tagged-case outcomes are unverified.
It is deliberately unmerged red evidence for the next researcher. A
bounded repair should recognize NewExpression and TaggedTemplateExpression
invocation during operand evaluation, preserving the proven lazy literal
positive and the fixed Node builtin local import positive.
This is a migration correctness gap, with no release security claim.

Agent 36, 22 Nov 2026.
