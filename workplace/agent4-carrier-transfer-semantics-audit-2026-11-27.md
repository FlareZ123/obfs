# Carrier transfer-semantics audit and soundness stopline

**Agent:** 4  
**Date:** 2026-11-27  
**Status:** source-level audit / unexecuted adversarial hypotheses; not an established result  
**Frozen source inspected:** `aa54147277fb98b244de25c4dd532cad294102ad`  
**Related executed oracle:** `bf96c212eb0b64abbb9d5bb69ed00c23d5b9b8b6`, run 45938520606 (11/19 red on Ubuntu/Windows/macOS)

## Executive conclusion

The corrected 19-case matrix is real evidence of eleven false-safe carrier-flow decisions, but repairing those eleven cases individually is not enough to claim general soundness.

The frozen carrier analysis splits expression reasoning into:

- `evaluateCarrierValue(node, environment, thisValue)`, intended to compute a carrier abstract value without applying general side effects; and
- `visitCarrierExpression(node, environment, thisValue)`, which mutates the carrier environment and sets exposure flags.

That separation is workable only if every caller composes value/effect evaluation in exact ECMAScript order and models conditional/abrupt execution. The frozen visitor does not. Several syntax classes either execute effects in a different order, execute effects that JavaScript may skip, or omit effects JavaScript must execute.

The canonical repair should therefore converge on **one ordered transfer relation**:

```
transferExpression(node, state) -> { state: StateSet, value: ValueRef }
transferStatement(node, state)  -> CompletionSet
```

where `StateSet` carries CFG predecessor/guard information, and `CompletionSet` distinguishes normal, break, continue, return and throw completions. The existing `ValueRef` / `DefinitionRef.controlFlowPointId` / `HostEffectRecord` contract is the right identity/effect vocabulary. The local `CarrierValue` implementation can remain an optimization or prototype lattice, but it should not become a second public resolver.

Until such ordered transfers exist, a claimed transform authorization based on “no WeakMap prototype exposure” needs a fail-closed grammar around unsupported effectful forms. Passing the 19 current cases is necessary but not sufficient.

## Why the executed 19-case matrix does not by itself prove the transfer engine

The exact red run logs show the following six native-shared cases currently pass by conservative refusal (`group:true`, `bindings:0`), not by precise branch evaluation:

- `if-false-binding-write`
- `switch-no-matching-case`
- `array-rest`
- `catch-predecessor-heap`
- `block-outer-write`
- `block-inner-shadow`

Only `direct-property-overwrite` and `direct-primitive` are nonshared positive controls that retain four identifier rewrites. Therefore “19/19 green” could still be obtained by broad over-refusal. Acceptance needs explicit positive-yield controls outside every new fail-closed rule.

## Source-level adversarial hypotheses outside the current matrix

The examples below are **not claimed CI failures**. They are derived from the exact frozen visitor and should be executed before promotion. Each witness is chosen so native execution reaches a WeakMap-backed prototype while the current transfer order can erase or omit that fact.

### 1. Logical assignment is modeled as unconditional assignment

Frozen `evaluateCarrierValue(AssignmentExpression)` returns the RHS. Frozen `visitCarrierExpression(AssignmentExpression)` visits the RHS and then unconditionally writes it to the left carrier.

But `||=` and `??=` may skip the RHS/write.

Candidate witness:

```js
const carrier={instance:new WeakMap()};
carrier.instance ||= {};
// native carrier.instance remains the WeakMap
Object.getPrototypeOf(carrier.instance);
```

The same issue applies to `??=`. A transfer must fork on the current left value/short-circuit condition; treating every assignment operator as `=` is not sound.

### 2. Optional chaining effects are currently unconditional

Frozen `MemberExpression` visits a computed property whenever `computed` is true, without checking `optional`. Generic `ChainExpression` delegation does not add a nullish branch.

Candidate witness:

```js
const carrier={instance:new WeakMap()};
null?.[(carrier.instance={})];
// native computed key is never evaluated
Object.getPrototypeOf(carrier.instance);
```

Optional calls have the same class of problem: arguments are skipped when the call short-circuits, but the frozen call visitor always visits arguments.

### 3. Switch case-test expressions are not visited

The frozen `SwitchStatement` visitor visits the discriminant and each consequent, but not `case.test`.

Candidate witness:

```js
let carrier={};
switch(0){
  case (carrier={instance:new WeakMap()},1): break;
}
Object.getPrototypeOf(carrier.instance);
```

ECMAScript evaluates the case test while seeking a match. The current carrier state never sees that assignment.

### 4. Abrupt completion does not stop later statements

`visitScopedCarrierBlock` and switch consequents visit every later statement after `break`, `continue`, `return` or `throw`. The carrier walker does not return a completion kind.

Candidate witnesses:

```js
const carrier={instance:new WeakMap()};
outer:{
  break outer;
  carrier.instance={}; // unreachable, but frozen walker visits it
}
Object.getPrototypeOf(carrier.instance);
```

and:

```js
const carrier={instance:new WeakMap()};
let result;
try{
  throw 1;
  carrier.instance={}; // unreachable
}catch{
  result=carrier.instance;
}
Object.getPrototypeOf(result);
```

The second also compounds the known catch-predecessor issue.

### 5. Computed assignment keys are omitted

For a member assignment the frozen special case visits `node.left.object` but not a computed `node.left.property`.

Candidate witness:

```js
let carrier={};
const target={};
target[(carrier={instance:new WeakMap()},"x")]=0;
Object.getPrototypeOf(carrier.instance);
```

The computed key is evaluated before the RHS write target is completed at runtime; its carrier effect is absent from the frozen visitor.

### 6. Object literal computed keys are omitted

Frozen `ObjectExpression` visits spread arguments and property values, but not computed property keys.

Candidate witness:

```js
let carrier={};
const obj={[(carrier={instance:new WeakMap()},"x")]:0};
Object.getPrototypeOf(carrier.instance);
```

### 7. Destructuring computed keys/default initializers are not effect transfers

`bindCarrierPattern` calculates static keys and uses `evaluateCarrierValue` for an `AssignmentPattern` default. It does not `visitCarrierExpression` for the computed key/default first.

Candidate witnesses:

```js
let carrier={};
const obj={x:0};
const {[((carrier={instance:new WeakMap()}),"x")]:v}=obj;
Object.getPrototypeOf(carrier.instance);
```

```js
let carrier={};
const {x=(carrier={instance:new WeakMap()})}={};
Object.getPrototypeOf(carrier.instance);
```

Pattern binding needs an ordered transfer, not a value-only lookup helper.

### 8. Call evaluation order is reversed for callee vs arguments

JavaScript evaluates the callee/reference before argument expressions. Frozen `CallExpression` loops through and visits arguments first, then visits `node.callee`.

Candidate witness:

```js
let carrier={};
const obj={m(x){return x;}};
obj[((carrier={instance:new WeakMap()}),"m")](carrier.instance);
```

Native: computed callee key sets the carrier before the argument reads it. Frozen order reads/evaluates the argument before applying the callee-key effect.

Even if the opaque-call rule eventually refuses this exact form for another reason, the transfer engine's state order is still wrong and can reappear in non-opaque summaries.

### 9. NewExpression does not visit the callee expression

Frozen `NewExpression` visits arguments and returns; it does not visit an effectful callee/reference.

Candidate witness:

```js
let carrier={};
const ns={C:class C{constructor(x){this.x=x;}}};
new ns[((carrier={instance:new WeakMap()}),"C")](carrier.instance);
Object.getPrototypeOf(carrier.instance);
```

Callee/reference effects happen before constructor arguments in JavaScript.

### 10. Class evaluation omits `extends` and computed keys

Frozen `ClassDeclaration` constructs a carrier, then walks property values/static blocks/method closure metadata. It does not transfer `superClass` or computed field/method keys.

Candidate witnesses:

```js
let carrier={};
class C extends ((carrier={instance:new WeakMap()}),Object){}
Object.getPrototypeOf(carrier.instance);
```

```js
let carrier={};
class C { [((carrier={instance:new WeakMap()}),"m")](){} }
Object.getPrototypeOf(carrier.instance);
```

### 11. Instance field initializers are transferred at class declaration time

For every `PropertyDefinition`, frozen code visits `element.value` regardless of `element.static`. Instance-field value initializers actually execute when an instance is constructed, not when the class is declared.

Candidate witness for false-safe over-application:

```js
const carrier={instance:new WeakMap()};
class C { x=(carrier.instance={}); }
// no new C()
Object.getPrototypeOf(carrier.instance);
```

Native keeps the WeakMap. The current visitor can apply the impossible overwrite at class evaluation. Conversely, deferring the initializer is required when `new C()` actually occurs.

Computed **field keys** are a separate timing rule: they are evaluated at class definition, while a nonstatic field **value** is evaluated per construction.

### 12. For-of value derivation can precede RHS effects

Frozen loop code derives `iterationValue=evaluateCarrierValue(statement.right,...)` and binds the left pattern before it later calls `visitCarrierExpression(statement.right,...)`.

Candidate witness:

```js
let carrier={};
for(const x of ((carrier={instance:new WeakMap()}),[carrier])){
  Object.getPrototypeOf(x.instance);
  break;
}
```

The value of `[carrier]` must be formed after the assignment effect. A pure value evaluation against pre-effect state can bind `x` incorrectly.

### 13. Local getter/setter effects are not represented by return-only summaries

A local getter can mutate an outer carrier even if its returned value is ordinary:

```js
let carrier={};
const obj={get x(){ carrier={instance:new WeakMap()}; return 0; }};
void obj.x;
Object.getPrototypeOf(carrier.instance);
```

Likewise setters and local methods can write captured bindings/containers. This is the same missing `FunctionSummary.effects` dimension already exposed by the executed `function-side-effect-outer` matrix case, generalized beyond direct identifier calls.

### 14. Function parameter defaults need call-time transfer

Default parameter expressions execute at call time, before the body, and can mutate captured state. Merely binding parameters to `carrierOther` in a later body analysis cannot model this.

Candidate witness:

```js
let carrier={};
function f(x=(carrier={instance:new WeakMap()})){}
f();
Object.getPrototypeOf(carrier.instance);
```

This should be represented by the called function's effect summary or by an ordered interprocedural transfer, not by executing defaults at declaration time.

## Architectural consequence

The recurring defect is not specific to WeakMap. It is a generic problem with using a value-only abstract evaluator plus a separate recursive effect walker for JavaScript, where:

1. expression evaluation has observable left-to-right order;
2. many subexpressions are conditional;
3. getters/proxies/coercions can re-enter user code;
4. statements have abrupt completion;
5. class and parameter syntax has non-obvious execution timing.

A sound canonical plan should have:

- **binding identity:** reuse the Stage-1 lexical `BindingRef` resolver, never name-only host/local guesses;
- **reaching definitions:** immutable `DefinitionRef` with CFG point/guard identity;
- **value identity:** immutable `ValueRef` and typed field/alias edges;
- **ordered expression transfer:** each syntactic form specifies exact child evaluation order and may-branches;
- **completion-aware statement transfer:** normal/break/continue/return/throw/finally state sets;
- **interprocedural effects:** `FunctionSummary.effects` for captured writes, receiver/argument field writes, unknown calls and re-entry;
- **host effects:** `HostEffectRecord` for WebIDL conversion/named setters/prototype observation;
- **explicit unknown-effect escalation:** unsupported getter/proxy/coercion/dynamic forms fail closed rather than silently returning `carrierOther`;
- **transform consumers:** one `SourceObservationPlan` reused by identifier/property/string/cross-file/SCO passes.

## Immediate integration guidance

For the frozen candidate, do not expand scope to a full interpreter before closing the known release blockers. A practical sequence is:

1. land the corrected 19-case oracle and the strict Storage named-setter oracle on one current-main review head;
2. fix the eleven executed reds using branch-local alias-preserving state and explicit joins/effects;
3. add a small **transfer-order adversary pack** covering at least logical assignment, optional chaining, switch case tests, abrupt completion, computed LHS keys, class timing, for-of RHS effects and a captured getter effect;
4. require exact native/emitted parity for every native-shared case and separate nonshared positive-yield controls;
5. if any of these constructs are not modeled, make their presence an explicit fail-closed reason rather than relying on the current recursive default;
6. only then claim the carrier proof is a candidate authorization analysis.

This document does not claim the listed hypotheses fail CI. They should remain in `workplace/` until executed and independently reproduced.
