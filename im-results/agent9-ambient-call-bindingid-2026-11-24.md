# Agent 9 — ambient call, callable-carrier, and source-observation donor

**Date:** 2026-11-24  
**Branch:** `agent9/ambient-call-bindingid-20261124`  
**Implementation:** `workplace/agent9-ambient-call-bindingid.js`  
**Focused tests:** `test/agent9-ambient-call-bindingid.test.js` (44 test declarations at this checkpoint)

## Status and scope

This is a research-only, single-AST analysis donor. It does not rewrite source, produce obfuscated output, establish cross-file safety, or constitute a production-ready property-renaming proof. Its `safe` field means only “no effect found in the modeled subset”; it is not a proof that a function or property is safe to transform.

The implementation reuses Agent 1's lexical resolver and BindingIds. The key distinction is between three independent observations:

- **DynamicFrame:** a function's active frame can reach an unknown host/runtime operation or an implicit protocol that may invoke code outside the local call graph.
- **HostHeldCallable:** a local callable value can be retained, inspected, coerced to source text, or forwarded across an unanalyzed boundary.
- **ExternalReachability:** a callable is exported or installed into a host-visible binding/object.

These axes must not be collapsed. A function can be HostHeldCallable without itself being ambient, and a caller can be DynamicFrame without the callable argument necessarily being the observed source.

## Implemented conservative analyses

### Binding and call edges

- Resolves direct function declarations, const-bound function expressions, and immutable const aliases through Agent 1 BindingIds.
- Builds local call edges and propagates DynamicFrame effects through the local call graph.
- Rejects mutable, overwritten, ambiguous, and unresolved call targets rather than inferring a fixed function from a name.
- Tracks simple callable value flow through const aliases, object/array aggregates, return expressions, mutable initializer/assignment alternatives, and bound-function wrappers.
- Follows local class-instance construction to class methods, including possible class values when a constructor binding is reassigned.
- Refuses classic-script function declarations as fixed local call targets; treats top-level classic-script bindings and Annex-B/global cases conservatively. CommonJS block-function Annex-B cases are also refused as fixed call targets.

### Host-held callable values and source observers

The value-carrier pass marks local callables as HostHeldCallable when they can cross unknown call/new/tag boundaries, be returned/yielded, be assigned to `this`, be installed on CommonJS exports or browser/Node global objects, or be retained in local class instances that escape.

It also detects callable metadata/source observation through `toString`, `toLocaleString`, `valueOf`, `join`, `name`, `length`, `caller`, `arguments`, `prototype`, and `constructor`; follows `arguments.callee` to its enclosing non-arrow function when the implicit binding is established; and marks functions in the lexical environment as held when direct eval or a debugger statement makes local callable values inspectable.

Callable source exposure is also tracked through coercive paths: string/number conversion, template interpolation, computed property keys, relational/equality coercion where applicable, update and arithmetic compound assignment, array stringification/join, thenable assimilation, yield/return, for-of, with-object environments, and destructuring from known local aggregates. Object/object identity equality is excluded from ToPrimitive classification; logical assignment is excluded from arithmetic coercion classification.

### External reachability

- ESM exported declarations, default exports, and local export specifiers.
- CommonJS `module.exports` and `exports.*` assignments, including callable aggregates.
- `globalThis`, `window`, `self`, and Node `global` property assignments, including const aliases.
- Top-level classic-script/CommonJS `this` exports; non-top-level `this` assignments are treated as potential callable escapes.

### DynamicFrame triggers

Unknown call/new targets, unknown member access, `with`, ToPrimitive/ToPropertyKey operations, `in`, `instanceof`, promise thenable assimilation, for-of iteration, destructuring, tagged-template calls, and debugger inspection fail closed. Plain-record member reads are admitted only by a deliberately narrow own-data-property/primitive-value proof; accessors, spreads, prototype mutation, reflection, unknown aliases, and dynamic keys do not qualify.

## Evidence

- The focused test file contains **44** `test(...)` declarations at this checkpoint.
- The last fully observed green workflow was **453135**. It passed the focused test/type-check jobs for the then-current checkpoint, before the latest callable-coercion, direct-eval/debugger, mutable-class, `arguments.callee`, and CommonJS Annex-B additions.
- A new focused workflow was dispatched after the latest additions. Its status could not yet be retrieved because the GitHub Actions listing endpoint repeatedly returned a rate-limit error. Therefore the latest 44-test checkpoint is **not yet claimed green**.
- Earlier focused runs exposed strict JSDoc type errors despite passing runtime tests; these were fixed and the corresponding type-check subsequently passed. The latest expansion still requires the dispatched workflow result.

## Known limitations / unresolved false-safe risks

1. **No cross-file graph.** BindingIds are per-AST here; there is no source-unit namespace, import/export edge closure, shared object identity, or cross-file mutation proof.
2. **No Program/Module wrapper frame.** Top-level host calls are not modeled as an explicit CommonJS wrapper/ESM module FrameContext. A host callback at top level may expose wrapper/source context beyond the per-function summaries.
3. **Incomplete caller-value reverse flow.** `Function.caller` and reflective caller/callee chains are not fully mapped back to all possible local caller functions.
4. **Class hierarchy uncertainty.** Direct class values and reassigned constructor bindings are followed, but mutable/aliased superclass expressions and all prototype mutation patterns are not fully closed.
5. **Incomplete value provenance.** Destructuring, proxies, accessors, deep aggregates, dynamic call results, native/Web IDL objects, imported functions, and reflective mutation remain partial or Unknown.
6. **No production transform or runtime validation.** No source-rewrite behavior-equivalence suite, browser/Node runtime source-observer harness, dynamic instrumentation resistance test, or 2.5× runtime benchmark has been completed here.
7. **No anti-LLM claim.** This work does not establish resistance to LLM-assisted reconstruction, static deobfuscation, or DevTools instrumentation.

## Recommended integration and next experiments

1. Treat this as a donor for Agent 3's canonical `SourceObservationPlan`, not a competing public API. Map DynamicFrame, callable carrier, and external reachability into the contract's separate frame/effect/carrier dimensions.
2. Add a Program/Module wrapper FrameContext and source-unit namespacing before cross-file analysis is attempted.
3. Add runtime witnesses for `Error.prepareStackTrace` / `CallSite.getFunction`, `Function.prototype.toString`, `arguments.callee`, `Function.caller`, coercion hooks, thenables, Proxy traps, and debugger pauses in Node and browser targets.
4. Add adversarial tests for mutable superclass bindings, inherited method escapes, `Function.caller` reverse edges, import/re-export chains, object spread, `Object.assign`, and reflective/proxy mutation.
5. Only after the plan is integrated, add source-to-source behavior-equivalence tests and benchmark the actual obfuscated output against the 2.5× runtime budget.

**Interpretation:** This donor improves fail-closed callable/source-observation accounting around one AST. It does not establish a generally safe property-renaming algorithm or demonstrate the primary obfuscator's end-to-end security/performance objective.
