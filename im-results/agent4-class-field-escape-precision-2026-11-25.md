# Agent 4: bounded class-field escape precision

**Date:** 2026-11-25  
**Branch:** agent4/agent9-local-owner-precision-20261125  
**Current branch head:** b8cd6409692f5ba769521fe36f2f788b8b902583  
**Code head with 15-case validation:** 2feb029ec4c334fe693337a7f93b5429294d9e20  
**Status:** experimental donor only; not production integration or release evidence

## Question

The Agent 9 ambient-call donor unconditionally treated every class PropertyDefinition initializer as HostHeldCallable. Can callable field values be deferred for a narrowly proven local class, then recovered only when the class, instance, or field value reaches an existing escape sink?

## Admission rule

The donor now defers only a callable field initializer when all of these hold:

- The containing class has a stable local binding (one declaration, not written).
- The class has no superclass and contains only public, non-computed, non-static instance fields; no methods, accessors, private fields, static blocks, or other class elements.
- Every field initializer is inert under a deliberately small whitelist: primitive literal, function/arrow expression, or an unmodified local identifier resolving to a function.
- Unsupported or side-effecting initializers invalidate deferral for the class. This prevents an eager field such as leak = (globalThis.saved = this) from publishing the instance while another field's callable is deferred.
- Function-valued field identifiers must be unmodified. callableNodesForValue now unions a function declaration with values assigned to its binding when that binding is written, instead of returning the declaration early and losing reassigned callables.

For admitted classes, classMethodFunctions includes the field initializer callables. Existing value sinks then recover them when the class or instance is exported, returned, passed to a host, or when a field read reaches a host or local-return sink. Arrow field closures are retained when the instance escapes, allowing captured helper callables to be discovered.

All other class shapes remain fail-closed through the existing PropertyDefinition handling.

## Red/green matrix

The focused file is test/agent4-class-field-escape-precision.test.js.

The 15-case matrix passed on Ubuntu and Windows, with strict project, external, and paired-budget JSDoc stages, in [run 45581653223](https://github.com/FlareZ123/obfs/actions/runs/45581653223).

Cases covered:
1. Uninstantiated private class does not publish its public field callable.
2. Local instance with no escaping use does not publish its field callable.
3. Exported class makes public field callable externally reachable.
4. Returning an instance publishes its field callables.
5. Passing an instance to a host publishes its field callables.
6. Passing a public field value to a host publishes the callable.
7. Local consumer discarding a field value does not publish it.
8. Local consumer returning a field value propagates the escape.
9. Escaping arrow field propagates its captured callable.
10. Const alias field initializer is recovered on instance escape.
11. Classes with methods retain field initializers conservatively.
12. Private fields retain initializers conservatively.
13. Static fields retain initializers conservatively.
14. Eager side-effecting sibling field prevents deferral of callable fields.
15. Reassigned function binding is not treated as a stable field initializer.

The ESM class-export control intentionally distinguishes effects: the class export makes the field callable externallyReachable; it is not necessarily a HostHeldCallable field-write effect. Its safe value must still be false.

The initial strict-JSDoc run [45581447473](https://github.com/FlareZ123/obfs/actions/runs/45581447473) executed all 15 tests successfully but failed external JSDoc because the new class-field iterator callback lacked an AstNode annotation. That annotation was added; run 45581653223 is green on both OSes.

## Pending adversarial control

A sixteenth test, added after the 15-case run, checks a field closure that calls external(this.callback) when invoked locally. It is queued in [run 45582098744](https://github.com/FlareZ123/obfs/actions/runs/45582098744), but the shared Actions runner is currently occupied by a long Agent 2 local-search job. Do not claim this case passed until the run actually completes.

If the test fails, the narrow repair is to refuse deferral when any deferred field function body references ThisExpression or Super; do not weaken the escape model to make the test green.

## Limitations and next validation

- The proof is intentionally narrow and does not handle classes with methods, inheritance, private/static/computed fields, side-effecting field initializers, or complex value expressions.
- It is not a general heap or class-instance points-to analysis; it relies on existing value sinks and classMethodFunctions.
- Writes are still may-flow unions, not path-sensitive overwrite analysis.
- The class-field changes and written-function-binding union have not yet been rerun through the existing Agent 4 and Agent 9 donor suites after this code change. Those suites must be rerun when the Actions queue permits.
- No cross-file/import flow, compiler integration, full repository acceptance, runtime benchmark, or 2.5x compute result is established.

Keep this in im-results until Agent 9/Agent 3 review the donor and decide whether it belongs in the shared SourceObservationPlan.
