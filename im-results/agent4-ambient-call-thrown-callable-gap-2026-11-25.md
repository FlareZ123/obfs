# Agent 4: ambient-call carrier audit in the BindingId donor

**Date:** 2026-11-25 06:00 UTC  
**Status:** intermediate research result; donor-only experiment, no production change, no PR  
**Donor base:** `agent9/ambient-call-bindingid-20261124`  
**Experiment branch:** [`agent4/agent9-throw-callable-review-20261125`](https://github.com/FlareZ123/obfs/tree/agent4/agent9-throw-callable-review-20261125)  
**Final experiment head:** `07a53e6490c621d9a5ad74043a06d98142e074dc`  
**Final implementation commit:** `4828dec1ae125b7e99d7180891d33a81607cd6da`

## Executive finding

The research-only BindingId ambient-call donor had multiple unmodelled callable-value carrier paths. In each red-first witness, a function defined in the analyzed source became observable by external code, while the donor left its `HostHeldCallable` effect false or omitted the value-flow edge.

The audit identified and prototyped conservative coverage for:

1. thrown callable values crossing a module/function boundary;
2. same-function catch bindings and callable values captured by escaping closures;
3. simple identifier parameter defaults;
4. callable writes through unknown object-property receivers;
5. callable values in class field initializers, including private instance fields and field closures;
6. implicit `arguments.callee` resolution, which was also an existing donor-suite failure.

These are **donor-level findings**, not current-main production compiler regressions. The donor is not integrated into the production transform.

## Red-first witnesses

### 1. Thrown callable escape

```js
function hidden() { return 1; }
function thrower() { throw hidden; }
module.exports = thrower;
```

An external caller invokes the exported function, catches the thrown value, and inspects `Function.prototype.toString.call(caught)`. The runtime value is the `hidden` function object. The donor initially reported it as not host-held.

- Red run: [45553818571](https://github.com/FlareZ123/obfs/actions/runs/45553818571), failure on Ubuntu and Windows.

### 2. Callable escape through closure capture

```js
function hidden() { return 1; }
function entry() {
  try { throw hidden; }
  catch (error) { return () => error; }
}
module.exports = entry;
```

The local catch alone does not expose the value. The returned closure captures the catch binding; an external caller invokes the closure, receives `hidden`, and can inspect its source. The donor's first local-catch refinement preserved the catch binding but did not propagate callable values through an escaping closure.

- Red run: [45555113316](https://github.com/FlareZ123/obfs/actions/runs/45555113316).

A non-escaping closure positive control was retained: a local closure that is neither returned nor passed to a host remains insufficient to mark its captured function as held.

### 3. Default parameter initializer

```js
function hidden() { return 1; }
function entry(callback = hidden) { return () => callback; }
module.exports = entry;
```

The external caller invokes `entry()`, then the returned closure, and obtains the source-defined `hidden` function. The donor did not add an `AssignmentPattern` default expression to the parameter binding's value set.

- Red run: [45555466007](https://github.com/FlareZ123/obfs/actions/runs/45555466007).

### 4. Unknown object-property write

```js
function hidden() { return 1; }
function entry(owner) { owner.callback = hidden; }
module.exports = entry;
```

The host supplies `owner`, invokes the exported entry point, and later inspects `owner.callback`. The donor did not treat an ordinary member assignment as publishing its callable RHS.

- Red run: [45556752970](https://github.com/FlareZ123/obfs/actions/runs/45556752970).

### 5. Class field initializer

```js
function hidden() { return 1; }
class C {
  #callback = hidden;
  getCallback() { return this.#callback; }
}
module.exports = C;
```

The host constructs the exported class, invokes the method, receives the field's function value, and inspects its source. The donor's class method inventory did not include identifier-valued field initializers.

- Red run: [45556957379](https://github.com/FlareZ123/obfs/actions/runs/45556957379).

### 6. Existing implicit-arguments classification failure

The donor's existing suite initially reported 43/44 passing on Ubuntu. The failing `arguments.callee` test expected the active function to be recognized as a held callable, but the lexical resolver classifies implicit `arguments` as `unknown/unproven-free-name`, not as a declared local binding.

- Red run: [45553903729](https://github.com/FlareZ123/obfs/actions/runs/45553903729).

## Experimental implementation

The final donor-only implementation at `4828dec1` adds:

- **Throw/catch flow:** callable values in `ThrowStatement.argument` are marked held when they leave the analyzed function/module or cross an unmodelled exception boundary. A same-function `catch(identifier)` adds the thrown expression to that binding's value set; a catch without a binding consumes the value; destructuring catches and cross-function throws remain fail-closed.
- **Closure capture fixed point:** each host-held closure is scanned for local references whose declarations are outside that closure. Callable values resolved through those bindings are added to the host-held set and recursively processed. This handles catch-binding capture, nested escaping closures, and object/array aliases.
- **Parameter defaults:** simple identifier `AssignmentPattern` defaults are added to the corresponding binding's value set. Complex destructuring defaults are conservatively marked held rather than decomposed.
- **Object-field writes:** callable RHS values of unknown `MemberExpression` assignments are marked held. This includes writes through host-supplied parameters and aliased receivers.
- **Class fields:** callable values in every `PropertyDefinition.value` are marked held, including private and static fields, direct function identifiers, and closure-valued fields.
- **Implicit `arguments.callee`:** an unshadowed `arguments` reference classified as `unknown/unproven-free-name` is associated with the nearest enclosing non-arrow function.
- **JSDoc:** the callable-effect reason parameter is typed as `AmbientCallReason['kind']`.

## Green evidence

Final experiment head: `07a53e6490c621d9a5ad74043a06d98142e074dc`.

- New focused carrier suite: [45557241773](https://github.com/FlareZ123/obfs/actions/runs/45557241773), 13/13 functional tests on Ubuntu and Windows. Project, external, and paired/runtime-budget JSDoc checks all passed on both platforms.
- Existing Agent 9 donor suite: [45557072412](https://github.com/FlareZ123/obfs/actions/runs/45557072412), all 44 tests passed on Ubuntu and Windows. All three JSDoc validation stages passed on both platforms.

These were focused runs through the existing manual-validation workflow. They are not a full repository/compiler gate.

## Precision costs and unresolved limits

The fixes are fail-closed approximations, not a complete value-flow engine:

- all unknown member writes are treated as potential publication, including writes to fresh local objects that never escape;
- every class field initializer is treated as potentially host-held, including fields on local, non-escaping classes;
- complex destructuring defaults and catch patterns are conservatively vetoed;
- throws crossing nested callable boundaries are treated as escaping because interprocedural exception propagation is not modeled;
- callable arguments to calls remain broadly marked held rather than being tracked precisely through actual-to-formal flow;
- cross-file import/export, dynamic imports, module wrapper/source-unit observation, and arbitrary debugger inspection remain outside this donor's proof;
- no three-mode integration, property-renaming acceptance, exact-source parity, or 2.5× performance result was measured.

The shared [source-observation carrier/effect contract](../workplace/source-observer-carrier-effect-contract-2026-11-23.md) already requires closure-capture, throw/catch, object-field, and interprocedural carrier edges. The red-first tests provide concrete evidence that the donor did not yet satisfy that contract.

## Recommended disposition

- Keep this branch as a research donor; do not merge it into production or open a standalone PR.
- Agent 9 should review the implementation and either adopt, refine, or reject each carrier rule.
- Agent 3 should use the fixtures when defining the composable SourceObservationPlan.
- Next precision work should prioritize receiver ownership, class escape analysis, destructuring/catch binding flow, and actual-to-formal propagation. Keep the red witnesses as permanent regression tests.
- Do not promote focused donor success to compiler acceptance or release status.
