# Out-of-scope unique-name call-target counterexample

**Date:** 2026-11-24  
**Owner:** Agent 1  
**Status:** bounded runtime reproduction plus static code-path analysis; not a full obfuscator execution or acceptance result.

## Question

Does the experimental transitive ambient-call guard prove that a uniquely named local function declaration is the binding resolved by a call site?

## Minimal source

The following source contains exactly one declaration named `getExternal`, but that declaration is nested in a function scope that is not an ancestor of the call in `hidden`:

```js
function decoyScope(){function getExternal(){}}
function hidden(){
  const owner={secretField:41};
  getExternal();
  return owner.secretField;
}
function publicReader(){return hidden();}
module.exports=publicReader;
```

A host injects a global callback named `getExternal`:

```js
const receiver = { caller: null };
const getExternal = Function(
  'receiver',
  'return function getExternal(){receiver.caller=arguments.callee.caller;}'
)(receiver);
```

It executes the source in a fresh VM context, calls the exported wrapper, then reads the captured function's source.

## Reproduction

Executed locally with Node.js v22.16.0:

```js
const vm = require('node:vm');
const receiver = { caller: null };
const getExternal = Function(
  'receiver',
  'return function getExternal(){receiver.caller=arguments.callee.caller;}'
)(receiver);
const source = [
  'function decoyScope(){function getExternal(){}}',
  'function hidden(){const owner={secretField:41};getExternal();return owner.secretField;}',
  'function publicReader(){return hidden();}',
  'module.exports=publicReader;'
].join('\n');
const context = { module: { exports: null }, getExternal };
vm.runInNewContext(source, context, { timeout: 1000 });
const value = context.module.exports();
const captured = receiver.caller;
process.stdout.write(JSON.stringify({
  value,
  capturedName: captured?.name,
  capturedSource: Function.prototype.toString.call(captured)
}) + '\n');
```

Observed output:

```json
{"value":41,"capturedName":"hidden","capturedSource":"function hidden(){const owner={secretField:41};getExternal();return owner.secretField;}"}
```

The runtime resolves the free call to the host-provided global callback, which captures the active `hidden` frame. The source is read after the call returns.

## Why the experimental guard misclassifies it

At prototype pin `agent1/experimental-transitive-caller-proof-20261123` (source blob `d170ee76eb79b90c030ffbacd2c1cbcdf5f916f7`), `staticCallableTargets` is populated from all uniquely named function declarations and const function expressions. `hasUnprovedAmbientDirectCall` resolves a call by `staticCallableTargets.get(callee.name)`.

For this source:

1. `bindings.get('getExternal') === 1`, because the only source declaration is the nested decoy.
2. `staticCallableTargets` therefore maps the spelling `getExternal` to the nested function in `decoyScope`.
3. The call in `hidden` is looked up by spelling only. The helper does not verify that the nested declaration's lexical scope encloses the call site.
4. The decoy function has no calls, so the recursive effect summary returns safe for that target.
5. `hidden` is otherwise used only as a direct call by `publicReader`; the prototype can consequently admit its owner-field read as private.
6. At runtime, the decoy binding is not visible in `hidden`. The free identifier resolves to the injected host global and observes the caller.

This is a lexical-binding false negative, not an implicit-getter case. A unique declaration spelling is not a resolved binding identity.

## Required correction

At minimum, verify that the scope returned by `scopes.get(callee.name)` is an ancestor of the call expression using the parent map. Prefer consuming a lexical resolver's exact binding identity. In the current read-only Agent 1 resolver, this arbitrary injected name (`getExternal`) is classified as `unknown` with reason `unproven-free-name` because it is not in the finite HOST_NAMES set; a caller-supplied host-binding contract could classify a specifically declared injected name as `free-host-candidate`. Both unknown and free-host-candidate must fail closed absent a reviewed callable/realm contract. The resolver is not itself production authorization.

Add this exact shape as a red regression before reusing the experimental direct-call guard. Keep the getter/implicit-dispatch red cases separate; fixing lexical target identity does not fix them.

## Evidence boundary

The Node reproduction proves the runtime scoping and caller-source observation. The conclusion that the experimental guard would misclassify the call is a static trace of its source code; this report does not claim to have run the full obfuscator on the prototype or measured emitted property metrics. No production source or candidate branch was changed.
