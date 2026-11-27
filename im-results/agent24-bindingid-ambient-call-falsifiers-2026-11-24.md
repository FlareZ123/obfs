# Agent 24: BindingId ambient-call prototype falsifiers

**Date:** 2026-11-24  
**Status:** intermediate adversarial review; no production change, no PR, no CI claim  
**Prototype under review:** branch `agent9/ambient-call-bindingid-20261124`, source SHA `5ce9d24ff781b124324559430c317eba04e0603e`  
**Reviewed files:** `workplace/agent9-ambient-call-bindingid.js`, `test/agent9-ambient-call-bindingid.test.js`, and `workplace/agent1-lexical-reference-resolver.js`  
**Runtime:** Node.js 22.16.0

## Question

Can the new per-AST BindingId ambient-call summary safely replace the earlier global-name call graph for the limited purpose of identifying local calls and propagating unknown host-caller/stack effects?

The resolver is a useful improvement for lexical identity, and the prototype correctly separates same-spelled bindings in nested scopes. However, three concrete false-safe patterns remain. The observations below combine static inspection of the pinned prototype with independently executed Node runtime witnesses. The prototype itself was not run locally in this environment, and no CI workflow was dispatched.

## Falsifier 1: a same-binding `var` initializer overwrites a function declaration

Source:

```js
function outer(callback) {
  function helper() { return 1; }
  var helper = callback;
  return function caller() { return helper(); };
}
```

Runtime witness:

```js
const observation = { caller: null };
const getExternal = Function('observation',
  'return function external(){observation.caller=arguments.callee.caller;}'
)(observation);
function outer(callback) {
  function helper() { return 1; }
  var helper = callback;
  return function caller() { return helper(); };
}
const caller = outer(getExternal);
caller();
console.log(Function.prototype.toString.call(observation.caller));
```

Observed output:

```text
function caller() { return helper(); }
```

The external callback captures the returned caller and can inspect its exact source.

**Static prototype path:** the resolver gives the function declaration and `var helper` declarator the same BindingId. The declarator identifier is a declaration, not a reference, so it does not appear in `references[]` with a write role. The prototype's `writtenBindings` therefore misses the initializer. The function declaration is inserted into `functionNodeByBinding`; the `var` initializer is an identifier callback, not another function-expression node, so it does not trigger the existing ambiguous-function-binding check. The `caller` reference resolves to the helper BindingId, and the graph can incorrectly use the original pure function as its target.

**Safe first cut:** inspect all same-ID declaration records and their parent `VariableDeclarator` nodes. Any same-ID `var` initializer with non-null `init` invalidates the function-declaration target unless reaching-definition/control-flow proof is supplied. A bare `var helper;` does not itself overwrite the function value.

## Falsifier 2: a later classic script rebinds a top-level mutable lexical function

First script:

```js
let helper = function helper(){ return 1; };
const caller = function caller(){ return helper(); };
```

Second script in the same realm:

```js
helper = getExternal;
```

Node witness:

```js
const vm = require('node:vm');
const observation = { caller: null };
const getExternal = Function('observation',
  'return function external(){observation.caller=arguments.callee.caller;}'
)(observation);
const context = { getExternal };
vm.createContext(context);
vm.runInContext(
  'let helper=function helper(){return 1;};' +
  'const caller=function caller(){return helper();};',
  context
);
vm.runInContext('helper=getExternal;', context);
vm.runInContext('caller();', context);
console.log(Function.prototype.toString.call(observation.caller));
```

Observed output:

```text
function caller(){return helper();}
```

**Static prototype path:** the resolver creates one Program scope per AST, so the first script's local top-level `let helper` is treated as stable within that AST. The prototype maps a function-valued `VariableDeclarator` regardless of whether the declaration kind is `const`, `let`, or `var`. The later script's write is not present in the first AST's `writtenBindings` set. At runtime, however, classic scripts in the same realm share the global lexical environment, so the second script rebinds the first script's `let`.

**Safe first cut:** for `sourceType:'script'`, reject mutable top-level lexical function targets and dependents unless a shared same-realm script-group binding/write environment and execution-order assumptions are supplied. Restricting the direct variable-bound function case to `const` addresses this specific rebind path, but does not solve the separate source-visibility of top-level lexical callables to other scripts.

## Falsifier 3: `with` Proxy `has` traps execute an ambient callback

Runtime witness:

```js
const observation = { ancestor: null };
const getExternal = Function('observation',
  'return function external(){observation.ancestor=arguments.callee.caller.caller;}'
)(observation);
const has = Function('getExternal',
  'return function has(target,key){if(key===\'x\'){getExternal();return true;}return false;}'
)(getExternal);
function hidden() {
  const owner = { secretField: 41 };
  with (new Proxy({}, { has })) { x; }
  return owner.secretField;
}
console.log(hidden(), Function.prototype.toString.call(observation.ancestor));
```

Observed output begins with `41` and the captured ancestor is the exact `hidden` function source.

**Static prototype path:** identifier resolution inside the `with` body is Unknown, but the ambient summary only inspects call/new/tag/await/yield/import nodes. The `WithStatement` itself is not marked ambient. The Proxy's `has` trap is invoked by the object-environment `HasBinding` operation, not by an explicit CallExpression in `hidden`; its function body is nested and skipped by `walkExecutableFunctionBody`. Consequently the summary can report no ambient call even though host code executes while `hidden` is active.

**Safe first cut:** treat every `WithStatement` in an executable callable body as an ambient effect unless object-environment and Proxy/accessor dispatch are explicitly modeled. This is distinct from ordinary property getter/Proxy-read effects.

## What is already handled

The prototype's `addFunctionBinding` detects two distinct function AST nodes sharing one BindingId: it removes the direct mapping and adds the ID to `ambiguousFunctionBindings`. Thus duplicate same-scope function declarations are conservatively rejected by the current branch. The remaining initializer issue is a non-function initializer (such as a callback parameter), which does not create a second function node.

The resolver's per-AST BindingIds remain useful. They should be used as lexical identity only, not as proof of runtime callable value, alias provenance, group-wide immutability, or absence of dynamic host effects.

## Recommended donor disposition

1. Add the same-ID non-null `var` initializer witness as a red-first test. Keep bare `var` declarations distinct from initialized declarators.
2. Require the intended `const`-only admission for function-expression variable declarators; model classic-script shared lexical writes or refuse mutable top-level script bindings.
3. Add a `WithStatement` Proxy-`has` witness and mark `with` ambient unless the effect is modeled.
4. Keep imported/member/dynamic calls, property getters, Proxy reads, Web IDL, primitive prototype dispatch, and cross-file identities as separate unresolved obligations.
5. Retain the prototype as an intermediate donor only. Do not use `safeBindingIds` as transform authorization, and do not port it as an isolated property-only integration.

Detailed communications were sent to Agent 9 and Agent 3 in `communications/agent9/` and `communications/agent3/`. The repository's canonical decision remains **NO-GO / RELEASE-BLOCKED** until one composable SourceObservationPlan is integrated and passes the exact-source comprehensive gate.
