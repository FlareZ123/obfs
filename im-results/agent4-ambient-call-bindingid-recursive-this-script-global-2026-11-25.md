# Agent 4: recursive return flow, receiver resolution, and classic-script global reachability

**Checkpoint:** 2026-11-25T12:17:11.179Z  
**Research branch:** `agent4/agent9-local-owner-precision-20261125`  
**Branch head:** `a726d91de8277ee19c402c1fd8a9e52f65f7f525`  
**Research status:** intermediate donor evidence; not production integration

## Scope

This continues the single-file ambient-call/source-observer donor in `workplace/agent9-ambient-call-bindingid.js`. It does not modify the production transformation pipeline. The branch was fast-forwarded from Agent 10's `951aa40b24a8056053a561e1a3d330f129d12fb6` snapshot (26 commits ahead, zero behind at comparison time), then extended with independent adversarial tests and fixes.

## Repairs

### 1. Recursive local call-return expansion

The prior `callReturnExpressions` followed explicit return expressions without carrying a visited-function path. A self-recursive return such as `choose(false) -> choose(true)` and mutually recursive factories could recurse until a stack overflow.

The resolver now returns rows containing the return expression, a path-local `seen` set, and the dynamic receiver. It adds a negative source-offset sentinel `-(target.start + 1)` for each function target. Resolver BindingIds are nonnegative, so this namespace is disjoint. Each sibling target receives its own copied path set; the guard does not globally suppress other target alternatives.

Coverage includes:
- direct self-recursive return with a reachable callable base case;
- mutually recursive functions;
- recursive factory return followed by a static member read;
- identity-parameter return and mutable local factory bindings with multiple assignments.

### 2. Receiver-aware method and getter returns

Return expressions from local member calls now retain their receiver when the target is not an arrow function. Static and nested member chains rooted at `this` are resolved against that receiver. Object-literal getters are resolved against the object literal that owns them.

Known primitive receiver fields remain negative controls: `this.count` resolving to a literal must not retain a sibling callable. Dynamic `this[key]`, opaque `this` expressions, and `super` shapes conservatively expose all callables reachable from the receiver rather than returning an empty value set.

Coverage includes direct and nested object getter/method reads, dynamic receiver keys, arrow closures that capture the getter receiver, and primitive-returning object accessors/methods.

**Precision caveat:** the class getter/method positives are not sufficient proof of precise receiver substitution because a method-bearing class is not eligible for the donor's deferred-field optimization; its callable field initializers are already conservatively held. The object-literal getter/method cases are the diagnostic receiver tests.

### 3. Mutable local factory targets

Carried Agent 10's follow-up: for a local identifier callee, `callReturnExpressions` unions the direct function target with the possible callable values resolved from the callee binding. This covers reassigned local factory bindings and multiple possible factory targets. Tests cover a single mutable factory and two branch-assigned factory closures.

### 4. Classic-script global lexical/value reachability

Red tests confirmed that the donor omitted top-level `ClassDeclaration` bindings from `topLevelScriptBindings`. It also failed to treat known values of top-level script bindings as externally reachable, which affected top-level class-expression bindings, object values, and instances assigned to global bindings.

The donor now:
- adds only direct-Program-child `ClassDeclaration` bindings to the classic-script global set (block-scoped classes remain local);
- traverses known values for top-level script bindings, including class declarations/expressions, object/array records, and instances stored through mutable global aliases;
- resolves top-level object-literal getter/method returns against their owning receiver.

The tests distinguish:
- top-level class declaration and class-expression bindings (externally reachable);
- top-level object and top-level instance bindings (externally reachable);
- a block-scoped class/object (not globally reachable);
- a `var` declared in a top-level block (still globally reachable);
- an uninstantiated CommonJS module-local class (not externally reachable).

## Evidence

### Red reproductions

- Run `45607661351`: recursive local return expansion overflowed; object getter `return this.callback` failed to retain its sibling callable.
- Run `45610426409`: top-level classic-script class declaration and class-expression bindings incorrectly reported `externallyReachable=false`.
- Run `45610717400`: the same class failures plus top-level object and top-level instance bindings incorrectly reported `externallyReachable=false`.
- Run `45611171270`: all 44 follow-up tests passed, but strict external JSDoc found a missing `@param {AstNode} fn` annotation after inserting the global-reachability block. The annotation was restored before the successful runs below.

### Green validation

- Run `45611473486`: focused follow-up suite, 43 pass / 0 fail / 1 explicit TODO, on Ubuntu and Windows; strict project, external, and paired/runtime-budget JSDoc stages all pass on both.
- Run `45611674621`: combined donor bundle including the Agent 10 captured-instance runtime witness, 161 tests / 160 pass / 0 fail / 1 TODO, on Ubuntu and Windows; all three strict JSDoc stages pass.
- Run `45611999779`: final expanded combined bundle, 165 tests / 164 pass / 0 fail / 1 TODO, on Ubuntu and Windows; strict project, external, and paired/runtime-budget JSDoc stages all pass on both.

The runtime witness executes the class-field closure case in Node's `vm` context. The external host receives a function and `Function.prototype.toString` recovers a source string matching `function hidden`. This is a concrete runtime witness for that case, not a general dynamic-analysis-resistance result.

## Remaining boundary and limitations

- One explicit TODO remains: prove that a private object remains private when mutated through a known local function parameter. Until that proof exists, this path stays fail-closed.
- The donor remains single-file. Cross-file imports, namespace re-exports, multi-file shared references, and full interprocedural call graphs are not established.
- Dynamic receiver fallbacks are intentionally conservative and can over-retain sibling callables.
- No production SourceObservationPlan integration or acceptance is established.
- No full repository release validation, browser compatibility matrix, runtime benchmark, or 2.5x compute-budget measurement was performed.
- These results concern a source-observer safety analysis donor; they are not evidence that the obfuscator's overall static/dynamic resistance or domain-locking behavior is complete.

## Next work

1. Obtain independent review from Agents 3 and 10 on the recursive return path, receiver context, and classic-script global-value treatment.
2. Ask Agent 9 to reproduce the runtime captured-instance witness and add an independent object-getter/method runtime witness.
3. Extend the harness to multi-file imports/exports, namespace aliases, shared object references, and dynamic/reflection boundaries.
4. Keep the private-mutator parameter case fail-closed until a red/green proof establishes the ownership invariant.
5. Only then evaluate whether a reviewed subset belongs in the current SourceObservationPlan and how it composes with property-renaming proofs.
6. Measure transformation/runtime overhead separately against the 2.5x budget; the current CI timings are analysis-test durations, not obfuscated-program runtime benchmarks.


## Follow-on checkpoint: export-root and spread exposure propagation

**Date:** 2026-11-25T12:28:04.933Z  
**Updated donor head:** `a726d91de8277ee19c402c1fd8a9e52f65f7f525`

A new red test showed that an exported ESM object getter returning a closed-over module callable was not reflected in the exported object's external-reachability summary. The getter function itself was marked external, but its returned callable was not. Run `45612665289` isolated this as the sole failure in the then-current 53-test follow-up suite (51 pass, 1 fail, 1 TODO).

Added `knownValueExpressions` and `callableNodesExposedByValue`:
- expand local aliases, factory returns, and statically named member reads;
- collect callables directly in values and those returned by reachable object-literal getters/methods through their actual receiver;
- traverse nested object/array containers and class method return values;
- apply the expanded set consistently to `markCallableValuesHeld`, `markExternalCallableValue`, and classic-script global roots.

This also covers object and array spread. Object spread can invoke a source getter and copy its callable return into the host-visible object; array spread can copy local callable elements. Tests now cover host-passed object getters/methods returning closed-over functions, exported ESM getter returns, primitive-returning getter negatives, object spread, exported object spread, and array spread.

**Latest combined validation:** run `45613731865`, 176 tests / 175 pass / 0 fail / 1 explicit TODO. Both Ubuntu and Windows jobs passed. Strict project, external, and paired/runtime-budget JSDoc stages passed on both. The captured-instance Node vm runtime witness remains included.

The explicit TODO remains the private-object mutation-through-known-function-parameter proof. This remains a donor-only static-analysis result; it does not establish cross-file module graph analysis, production integration, full release acceptance, or the 2.5x runtime budget.
