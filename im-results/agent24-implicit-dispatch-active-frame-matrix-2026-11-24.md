# Agent 24: implicit JavaScript dispatch active-frame witness matrix

**Date:** 2026-11-24  
**Status:** intermediate runtime evidence; no compiler changes and no CI claim  
**Runtime:** Node.js 22.16.0  
**Target donor:** Agent 9's `summarizeAmbientCallEffects` branch `5ce9d24ff781b124324559430c317eba04e0603e`

## Finding

Several ordinary JavaScript constructs can execute user-controlled callbacks while a function is active without containing any CallExpression in that function's AST. A sloppy external callback can capture the active function via `arguments.callee.caller.caller` and read its source. The current Agent 9 summary visits explicit calls, constructors, tags, await/yield and dynamic imports, but does not classify these implicit protocol/internal-method operations as ambient effects.

## Reproduction harness

Each case was executed separately on Node 22.16.0. The external callback records the active ancestor function; the output includes the exact captured source.

```js
function makeExternal(observation) {
  return Function('observation',
    'return function external(){observation.ancestor=arguments.callee.caller.caller;}'
  )(observation);
}
function report(label, observation) {
  const fn=observation.ancestor;
  console.log(label, Boolean(fn), fn ? fn.name : null,
    fn ? Function.prototype.toString.call(fn).replace(/\s+/g,' ').trim() : null);
}

// for...of: IteratorNext invokes a user-supplied next method.
{
  const observation={}; const getExternal=makeExternal(observation);
  const iterable={
    [Symbol.iterator]:function iterator(){return this;},
    next:function next(){getExternal();return {done:true};}
  };
  function hiddenForOf(value){for(const item of value){}}
  hiddenForOf(iterable); report('for-of',observation);
}

// in: Proxy [[HasProperty]].
{
  const observation={}; const getExternal=makeExternal(observation);
  const has=Function('getExternal',
    'return function has(target,key){getExternal();return false;}')(getExternal);
  function hiddenIn(value){return 'x' in value;}
  hiddenIn(new Proxy({}, {has})); report('in',observation);
}

// for...in: Proxy [[OwnPropertyKeys]].
{
  const observation={}; const getExternal=makeExternal(observation);
  const ownKeys=Function('getExternal',
    'return function ownKeys(target){getExternal();return [];}')(getExternal);
  function hiddenForIn(value){for(const key in value){}}
  hiddenForIn(new Proxy({}, {ownKeys})); report('for-in',observation);
}

// instanceof: custom Symbol.hasInstance.
{
  const observation={}; const getExternal=makeExternal(observation);
  const hasInstance=Function('getExternal',
    'return function hasInstance(value){getExternal();return false;}')(getExternal);
  const C={[Symbol.hasInstance]:hasInstance};
  function hiddenInstance(value){return value instanceof C;}
  hiddenInstance({}); report('instanceof',observation);
}

// delete: Proxy [[Delete]].
{
  const observation={}; const getExternal=makeExternal(observation);
  const deleteProperty=Function('getExternal',
    'return function deleteProperty(target,key){getExternal();return true;}')(getExternal);
  function hiddenDelete(value){delete value.x;}
  hiddenDelete(new Proxy({}, {deleteProperty})); report('delete',observation);
}

// Object destructuring: Proxy [[Get]].
{
  const observation={}; const getExternal=makeExternal(observation);
  const get=Function('getExternal',
    'return function get(target,key,receiver){if(key===\'x\')getExternal();return 1;}')(getExternal);
  function hiddenDestructure(value){const {x}=value;return x;}
  hiddenDestructure(new Proxy({}, {get})); report('object-destructure',observation);
}

// Array destructuring: iterator protocol.
{
  const observation={}; const getExternal=makeExternal(observation);
  const iterable={
    [Symbol.iterator]:function iterator(){return this;},
    next:function next(){getExternal();return {done:true};}
  };
  function hiddenArrayDestructure(value){const [x]=value;return x;}
  hiddenArrayDestructure(iterable); report('array-destructure',observation);
}
```

Observed output:

```text
for-of true hiddenForOf function hiddenForOf(value){for(const item of value){}}
in true hiddenIn function hiddenIn(value){return 'x' in value;}
for-in true hiddenForIn function hiddenForIn(value){for(const key in value){}}
instanceof true hiddenInstance function hiddenInstance(value){return value instanceof C;}
delete true hiddenDelete function hiddenDelete(value){delete value.x;}
object-destructure true hiddenDestructure function hiddenDestructure(value){const {x}=value;return x;}
array-destructure true hiddenArrayDestructure function hiddenArrayDestructure(value){const [x]=value;return x;}
```

All seven cases invoked the external callback and captured the exact active function source.

## Operation-to-effect mapping

| Syntax in analyzed callable | Runtime operation that can execute user code | Missing ambient summary event |
| --- | --- | --- |
| `for...of` / `for await...of` | `GetIterator`, `@@iterator`, `next`, async iterator dispatch | `IteratorDispatch` |
| `in` | Proxy `[[HasProperty]]` | `ProxyHas` |
| `for...in` | Proxy `[[OwnPropertyKeys]]`, `[[GetOwnProperty]]` | `ProxyEnumeration` |
| `instanceof` | custom `Symbol.hasInstance` | `CustomHasInstance` |
| `delete obj.x` | Proxy `[[Delete]]` / deleteProperty trap | `ProxyDelete` |
| object destructuring | Proxy/accessor `[[Get]]`, property enumeration | `AccessorCall` / `ProxyGet` |
| array destructuring | iterator protocol | `IteratorDispatch` |

The previously reported `with` witness adds Proxy `[[HasProperty]]` during object-environment binding lookup. The Agent 9 summary does not inspect `WithStatement`, `ForOfStatement`, `ForInStatement`, `BinaryExpression` operators `in` / `instanceof`, `UnaryExpression` operator `delete`, or destructuring patterns for ambient effects.

## Implications

- An AST scan for CallExpression alone cannot prove the absence of active-frame host effects.
- These operations should create explicit `HostEffectKind` events or conservatively attach `UnknownHostEffect` to the containing callable span.
- The current `PrimitiveIterator` proposal covers primitive-origin iteration but is not a substitute for general object iterators; a hostile object may supply its own iterator.
- `AccessorCall` / Proxy Get coverage should be distinct from Proxy Has, enumeration, delete and custom `@@hasInstance` dispatch.
- A positive proof may admit a construct only when its receiver/protocol/intrinsics are independently proven inert under the selected mode's threat model. Do not assume client-side intrinsics are pristine in COO.

This matrix does not prove a defect in the lexical BindingId resolver. It identifies effect classes that a consumer must not infer absent from lexical call-graph edges. It also does not prove that every use of these constructs is hostile; the safe first cut is conservative Unknown unless the relevant dispatch is modeled.


## 6. Additional Proxy internal-method controls

Two further Node 22.16.0 cases extend the active-frame matrix.

### Proxy `[[Set]]` from ordinary property assignment

```js
const observation = { ancestor: null };
const getExternal = Function('observation',
  'return function external(){observation.ancestor=arguments.callee.caller.caller;}'
)(observation);
const set = Function('getExternal',
  'return function set(target,key,value,receiver){getExternal();return true;}'
)(getExternal);
function hidden(value) { value.x = 1; }
hidden(new Proxy({}, { set }));
console.log(Function.prototype.toString.call(observation.ancestor));
```

Observed source: `function hidden(value) { value.x = 1; }`. The `[[Set]]` trap runs without a CallExpression in `hidden`.

### Proxy `[[GetPrototypeOf]]` during `for...in`

```js
const observation = { ancestor: null };
const getExternal = Function('observation',
  'return function external(){observation.ancestor=arguments.callee.caller.caller;}'
)(observation);
const getPrototypeOf = Function('getExternal',
  'return function getPrototypeOf(target){getExternal();return null;}'
)(getExternal);
function hidden(value) { for (const key in value) {} }
hidden(new Proxy({}, { getPrototypeOf }));
console.log(Function.prototype.toString.call(observation.ancestor));
```

Observed source: `function hidden(value) { for (const key in value) {} }`. The enumeration operation reaches the Proxy `[[GetPrototypeOf]]` trap in addition to `[[OwnPropertyKeys]]` / `[[GetOwnProperty]]`.

The operation-to-effect table above should therefore include `ProxySet` and `ProxyGetPrototypeOf`, or explicitly state that the generic `ProxyInternalMethod` event covers these internal methods. `AccessorCall` should include both getter and setter invocation.


## 7. Executable matrix

The complete eleven-case runtime matrix is now preserved as `sims/agent24_implicit_dispatch_active_frame_matrix.js`. It covers IteratorNext, Proxy Has, Proxy OwnKeys, Proxy GetPrototypeOf, CustomHasInstance, Proxy Delete, Proxy Get during object destructuring, array-destructuring IteratorNext, With/Proxy Has, Proxy Set, and an accessor setter. It intentionally runs as sloppy CommonJS because the WithStatement witness is part of the matrix; external callbacks and traps are created with `Function()` to preserve sloppy caller introspection.

I executed the local copy on Node 22.16.0. All eleven assertions passed and each captured the expected active function name and source. The script is a runtime-semantics control, not a compiler test and not a claim that a property rename was emitted.


## 8. Strict-mode scope

The caller-capture harness deliberately uses sloppy active functions and sloppy external callbacks. In Node/V8, if the analyzed active function itself is strict, a sloppy callback's `arguments.callee.caller.caller` chain can terminate at `null`; the matrix therefore proves these dispatches expose the active function under the tested sloppy-mode conditions, not that this particular legacy caller-introspection technique works in every strict-mode program. Strict-mode behavior, stack metadata, debugger instrumentation and other source-observation channels must be evaluated separately. The effect contract should retain the dispatch events without claiming every callback can always obtain a Function object.
