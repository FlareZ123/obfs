# Agent 2 — bound-function creation proof prototype

Date: 2026-11-26 UTC  
Status: experimental; review branch only; not production-integrated

## Problem

The full manual-validation baseline and PR #379 candidate share three persistent bound-related yield failures:
- `bound-runtime-interception`
- `bound-runtime-minifier-control`
- `source-stable-bound-export`

A minimal current-main diagnostic (run 4110, ID `45727032859`) used a private owner object captured by a const arrow function and exported `internal.bind(null)`. It reported:
- `observesFunctionSource(ast) === false`
- `observesDistributedSource(ast) === false`
- `proveLocalObject(ast, "owner", bindings) === null`
- `renameLocalProperties(...).properties === 0`
- full `obfuscateFiles(...)` property metrics 0

A direct exported-function control also returned proof null / 0 properties. This isolates the refusal to `privateFunctionNodes` in `src/properties.js`, not the global source-observer guards. The current rule treats a function value as private only when all non-declaration uses are direct calls; a static `internal.bind(null)` receiver use is not admitted.

## Experimental rule

On review-only branch `agent2/pr379-review-probe-candidate-20261125`, a prototype changes the private-function use proof to admit a const arrow target only when its non-declaration use is the receiver of a direct, static, non-optional `.bind` call and every bound argument is a primitive literal.

The hypothesis:
- the target arrow is not otherwise aliased, returned, exported, or passed to unknown code;
- the existing owner proof still rejects owner escapes, dynamic property keys, reflection, unsupported uses, and unproved nested function contexts;
- the in-program source-observer guard still runs first and rejects code that reads the target's source;
- the bound wrapper's own `Function#toString` is native wrapper source, not the target body;
- a hostile host may intercept `bind` and capture the target, but it sees the transformed target source, which is the intended obfuscation threat model.

This is not yet an accepted proof. It assumes the source-level semantics of `bind` are not replaced by a program-defined source-observing implementation; the negative observer test below checks one direct `Function.prototype.toString.call(this)` pattern but does not exhaust all mutation/alias routes.

## Test evidence

Temporary test files:
- `test/pr379-bound-function-proof-prototype.test.js`
- `test/pr379-bound-function-proof-suite.test.js`
- `test/pr379-bound-export-diagnostic.test.js` (intentionally failing diagnostic; do not include in full test discovery)

The six-case prototype matrix tests:
1. Positive: bound-only const arrow target permits two owner property rewrites.
2. Negative: directly exported target remains refused.
3. Negative: alias of target before bind remains refused.
4. Negative: computed `["bind"]` remains refused.
5. Negative: nonliteral bound argument containing owner remains refused.
6. Negative: in-program `Function.prototype.toString.call(this)` observer remains refused.

Run 4113 / ID `45727965018` reported all six prototype tests passing on Ubuntu; Windows also reached the strict JSDoc stage without a Node-test failure. The run failed strict JSDoc because the first prototype used repeated `parents.get(member)` calls and the checker could not narrow the resulting node type.

The existing hostile interception test `test/bound-runtime-interception.test.js` passed on Windows in run 4112 / ID `45727654066` with two property rewrites; that run also failed strict JSDoc for the same type-narrowing issue.

The code now binds the parent node once and uses an explicit local `CallExpression` JSDoc assertion (commit `43e92cd2504cefae86e16e79d713b564b5a9a190`). Aggregated validation of the three existing bound-runtime/source-stability tests plus the six prototype tests was dispatched as run 4118 / ID `45729374454`; it was queued at the last check.

## Required validation before any integration

- Confirm run 4118 passes project and external JSDoc on both OSes and that all nine tests pass.
- Add negative controls for function declarations/named function expressions, aliasing the `bind` method, non-forwarding custom `bind`, in-program `Function.prototype.bind` mutation, bound target used in multiple distinct contexts, and function source observation through aliases/reflection.
- Verify `hot.name`, `hot.length`, own keys, constructability, native wrapper `toString`, and runtime values remain native-equivalent.
- Run the complete mainline manual-validation suite against the current baseline and candidate; do not infer whole-repository safety from focused tests.
- Have Agent 29 (test author) and Agent 10 (prior bound-runtime analysis) independently challenge the proof.
- Keep this branch isolated. No production code, main branch, or PR #379 was changed by this prototype.

## Current interpretation

This prototype is a plausible, narrowly scoped route to recover three valuable property-renaming cases without weakening the global source-observer gate. The direct-call-only privacy rule is intentionally conservative; any extension must preserve that fail-closed boundary for every unsupported function escape. No security or 2.5x runtime claim is established.
