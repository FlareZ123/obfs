# Agent 10: property-specific mutable member-flow repair prototype

**Date:** 2026-11-25  
**Status:** experimental candidate; focused and combined donor suites green on both OSes  
**Branch:** `agent10/agent4-member-property-precision-prototype-20261125`  
**Head:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

## Problem

The direct `this` / `super` class-field guard did not account for a field function reading the instance through a mutable lexical alias:

```js
let owner;
function hidden() { return 1; }
function leak() { external(owner.callback); }
class Local { callback = hidden; leak = leak; }
function entry() {
  const instance = new Local();
  owner = instance;
  instance.leak();
}
module.exports = entry;
```

The field function has no `this` / `super`. It closes over `owner`, which is assigned the local instance before invocation. The pre-repair MemberExpression resolver did not propagate the mutable binding's known assigned values through `owner.callback`, leaving `hidden` falsely safe.

Confirmed red receipts on the test-only review branch:
- [45584939471](https://github.com/FlareZ123/obfs/actions/runs/45584939471): module-scope alias fails on Ubuntu and Windows.
- [45585153164](https://github.com/FlareZ123/obfs/actions/runs/45585153164): module-scope and function-local aliases fail on both OSes.
- [45585356409](https://github.com/FlareZ123/obfs/actions/runs/45585356409): function-local, inline FunctionExpression and ArrowFunctionExpression field variants fail on both OSes.
- [45585714664](https://github.com/FlareZ123/obfs/actions/runs/45585714664) and [45586064341](https://github.com/FlareZ123/obfs/actions/runs/45586064341) add passing const data-holder and accessor-holder controls. The demonstrated failure is specifically the direct mutable lexical binding assigned the instance, not every object-property/accessor alias.

## Candidate implementation

The candidate branch leaves Agent 4's donor branch untouched. It modifies `callableNodesForValue(MemberExpression)` and adds two helpers:

1. `classFieldCallablesForProperty(classNode, propertyKey)` resolves the matching public instance field/method, including known inherited class nodes, instead of returning every callable field for a statically known property.
2. `callableNodesForMemberValue(value, propertyKey, seen)` propagates the member read through known values: local-record member values, mutable/const binding values, `NewExpression` class fields, object/array literals, conditional/logical/sequence/assignment/chain/await expressions, and local function return expressions.

For a static property key, the candidate preserves the property identity. For a computed/dynamic key, it deliberately falls back to all callables reachable from known assigned receiver values. The exact local-record path remains first. The `CallExpression` return resolver handles Identifier callees, MemberExpression callees, and direct function/arrow IIFEs; it inspects block returns and expression-bodied arrows.

This refinement followed an earlier broad fallback that merely unioned all callables from assigned receiver values. That broad version fixed the alias false-safes but introduced a precision regression: reading a primitive `owner.value` incorrectly retained unrelated `callback=hidden`. Run [45588544550](https://github.com/FlareZ123/obfs/actions/runs/45588544550) fails that negative control on both OSes (29/30 pass). The property-specific resolver was introduced to retain the actual member value instead.

A further gap was found in the first property-specific version: a mutable alias assigned from an object-method arrow factory, `owner=factory.create()`, where `create:()=>new Local()`. Run [45590701585](https://github.com/FlareZ123/obfs/actions/runs/45590701585) fails this control before the MemberExpression-callee return resolver was added. The updated helper resolves the factory property to its arrow function and propagates the expression-body return.

## Validation

The final candidate branch head `03d2f3a6e02817be2df26acf2e5e8c318dd484ed` contains 33 focused class-field tests. The test set includes:
- module-scope and function-local mutable aliases;
- identifier, inline function and arrow field functions;
- static and dynamic member keys;
- destructuring;
- local function and expression-bodied arrow factory returns;
- object-method arrow factory returns;
- a nested `owner.current.callback` chain through a function-local record;
- const data-holder and accessor-holder controls;
- a non-callable sibling-field negative control.

Verified runs:

| Run | Scope | Ubuntu | Windows | JSDoc |
|---|---|---:|---:|---|
| [45589973479](https://github.com/FlareZ123/obfs/actions/runs/45589973479) | 30 class-field cases | 30/30 | 30/30 | project, external, paired-budget pass |
| [45590415667](https://github.com/FlareZ123/obfs/actions/runs/45590415667) | 32 class-field cases | 32/32 | 32/32 | project, external, paired-budget pass |
| [45590921191](https://github.com/FlareZ123/obfs/actions/runs/45590921191) | 33 class-field cases | 33/33 | 33/33 | project, external, paired-budget pass |
| [45591078902](https://github.com/FlareZ123/obfs/actions/runs/45591078902) | combined local-record/class-field/Agent 4/Agent 9 bundle | 116/116 | 116/116 | project, external, paired-budget pass |

The combined run's Node 22 job was skipped by the focused workflow design; Ubuntu and Windows jobs completed successfully. These are static-analysis regression and type-check results, not full repository acceptance or obfuscated-runtime performance measurements.

## Remaining limitations and next checks

- The patch is still an experimental donor, not integrated into the production obfuscator or Agent 4's branch.
- The combined suite is scoped to local-record, class-field, Agent 4 ambient-call and Agent 9 BindingId regression tests. It does not establish cross-file/import/require alias soundness, browser/Node runtime equivalence, full reflection/proxy/getter behavior, dynamic eval safety, or whole-project correctness.
- The conservative dynamic-key fallback may reduce rename eligibility. Measure its effect on real projects and inspect property-specific precision on computed-key cases.
- Review class inheritance, static fields, accessor returns, bound/method calls, cross-module factories, destructured assignment and more complex call-return aliases before accepting the helper as a general value-flow solution.
- No obfuscated-runtime benchmark or 2.5x compute-budget evidence has been produced. The test durations are analysis-test durations only.
- Keep the candidate branch isolated until Agent 4 / Agent 3 review the code and full evidence. The primary obfuscator objective remains RELEASE-BLOCKED.
