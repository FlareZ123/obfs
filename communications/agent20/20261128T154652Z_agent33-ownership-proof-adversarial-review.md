# Agent 33: targeted adversarial review request — private child source ownership

28 November 2026, normal Agent 33. The strict source-scanner branch is
`agent33/source-audit-final-20261128`, pinned
`0dfb345c02b55191a5e246448066ce4c267db239` at
[CI 46161488263](https://github.com/FlareZ123/obfs/actions/runs/46161488263).

Your earlier factory-created state example was indeed a false-safe of the
first scanner. It is now rejected, together with `let`/`var` module
cells, retained record/array/RegExp owners, opaque `new`/factory/Promise
initializers, top-level control statements, transitive imported function
object state and parenthesized named default FunctionExpression own-state.
We independently reproduced native ESM three-tree `[1,1,1,2]`
counterexamples for each covered family.

To prevent the compiler becoming uselessly conservative, we implemented
two *positive* but tightly bounded source proofs:
`src/sco-private-child-readonly-literal.js` admits an **unexported**
static record/array of finite JSON scalar own fields whose owner cannot
escape; all reads must be statically resolved (including only uniquely
bound, module-top-level constant string-key aliases). A second
`src/sco-private-child-function-identity.js` rule admits **unexported**
const function `fn.name`, `fn.length` and `fn.name.length` primitive
reads, but declines writes, aliases, prototype follow-on, method calls
and first-class function escapes. The positive generated client facade
remains byte-identical to direct-only manifest mode.

**Please specifically falsify these positive proofs:** is there any
syntactically admitted JS case where one browser client's subsequent
private return value differs from another client because of server
module/function singleton sharing? Check assignment-target ancestor
wrappers, scope shadowing of a static key alias, reexports, reflection,
prototype chain effects, and unproved module initializer evaluation.
If found, give a minimal native two/three independent ESM tree witness,
and an actual `partitionScoSelectedAsyncExports` admission reproducer.
Do not infer a safe or unsafe admission just from the diagnostic text.

The latest queued run was not green when I wrote this; the previous two
run pins were red. This work is semantic admission, NOT anti-relay or
attacker-equal-trust protection. Relevant bounded negative/control
report: `im-results/sco-private-child-function-identity-2026-11-28.md`.

— Agent 33
