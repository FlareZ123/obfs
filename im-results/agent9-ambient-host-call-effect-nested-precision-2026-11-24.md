# Agent 9: nested-function precision refinement for ambient host-call gate

**Date:** 2026-11-24 UTC  
**Status:** Focused proof-of-concept; not merged and not full-suite validated.

## Source pin and run

- Branch: agent9-ambient-host-call-effect-nested-precision-20261123
- Final source SHA: ddabe200cdf1fb059268e6c1277c693b8fee9d2a
- Implementation: src/properties.js, blob 57bb5a8c0961ac8e24715407d8f9e6bca05ceac7
- Test: test/agent9-private-property-external-caller-source-witness.test.js
- Workflow: manual-validation.yml, focused_test=test/agent9-private-property-external-caller-source-witness.test.js
- Run: [45293458665](https://github.com/FlareZ123/obfs/actions/runs/45293458665)
- Result: 9/9 tests passed on Ubuntu and Windows; strict project JSDoc, external JSDoc, and auxiliary evaluator JSDoc all passed on both.

## Refinement

The first prototype used the generic AST walker, which descended into nested function bodies and could taint an enclosing function even when the nested closure was never invoked.

The refined `walkExecutableFunctionBody` visits the current function's executable AST while skipping nested FunctionDeclaration, FunctionExpression, and ArrowFunctionExpression bodies. Nested functions are analyzed as separate callable bindings. The parent is tainted only if it has an actual local call edge to an unsafe nested/local callable. YieldExpression and ImportExpression are now also treated as unknown ambient effects.

## Nine-case matrix

Across COO, SNO, and SCO:

1. A direct-call-only helper that invokes a free host callback remains source-exact when the host callback captures arguments.callee.caller.
2. A direct-call-only helper with no unknown calls retains property renaming.
3. A helper containing an uninvoked nested function that calls an unknown host function still retains property renaming.

All nine cases pass on both operating systems. The first three demonstrate the ambient caller gate; the latter six demonstrate that pure helpers and uninvoked nested closures retain the intended local-property yield. The workflow also passed all strict JSDoc stages.

## Remaining limits

This remains a prototype, not a complete SourceObservationPlan:

- All non-local calls are conservatively treated as ambient; no trusted intrinsic whitelist exists.
- Property getters, Proxy traps, DOM/Web-IDL setters, and other callback-producing reads/writes are not modeled.
- Only selected call/constructor/tag/await/yield/import syntax is modeled; additional host effects may exist.
- Local call edges rely on unique in-file callable bindings; imported/member/dynamic alias flows remain conservative or unresolved.
- The prototype changes the property pass only; identifier-source parity remains a separate gap.
- No full suite, browser suite, cross-file graph matrix, or 2.5x compute admission was established.

The refined walker is a better candidate effect primitive than the first generic walk, but should still be integrated through the canonical SourceObservationPlan and validated against the broader repository matrix before production use.
