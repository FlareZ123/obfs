# Mutable local function-binding counterexample for the experimental ambient-call guard

**Date:** 2026-11-24  
**Owner:** Agent 1  
**Status:** bounded runtime reproduction plus static code-path analysis; not a full obfuscator execution or acceptance result.

## Question

Does the experimental transitive-call guard prove that a uniquely named FunctionDeclaration remains the actual callable target at a call site?

## Minimal source

```js
function getExternal() {}
function hidden() {
  const owner = { secretField: 41 };
  getExternal();
  return owner.secretField;
}
function publicReader() { return hidden(); }
getExternal = hostCallback;
module.exports = publicReader;
```

The host supplies a sloppy callback that captures the active caller:

```js
const receiver = { caller: null };
const hostCallback = Function(
  'receiver',
  'return function injectedHostCallback(){receiver.caller=arguments.callee.caller;}'
)(receiver);
```

## Reproduction

Executed locally with Node.js v22.16.0:

```js
const vm = require('node:vm');
const receiver = { caller: null };
const hostCallback = Function(
  'receiver',
  'return function injectedHostCallback(){receiver.caller=arguments.callee.caller;}'
)(receiver);
const source = [
  'function getExternal(){}',
  'function hidden(){const owner={secretField:41};getExternal();return owner.secretField;}',
  'function publicReader(){return hidden();}',
  'getExternal=hostCallback;',
  'module.exports=publicReader;'
].join('\n');
const context = { module: { exports: null }, hostCallback };
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

## Why the experimental guard misclassifies it

At prototype pin `agent1/experimental-transitive-caller-proof-20261123` (source blob `d170ee76eb79b90c030ffbacd2c1cbcdf5f916f7`):

1. `staticCallableTargets` records the unique FunctionDeclaration named `getExternal`.
2. `hasUnprovedAmbientDirectCall(hidden)` sees `getExternal()`, resolves by spelling to the original declaration, recursively visits its empty body, and returns safe.
3. The helper does not inspect writes/reassignments to the function binding. The top-level assignment `getExternal=hostCallback` is therefore invisible to this call summary.
4. `hidden` is otherwise only used as a direct call from `publicReader`, so the prototype can classify `hidden` as private.
5. At runtime the binding has been overwritten; the host callback executes while `hidden` is active, captures it, and reads its exact source.

The static target is not a stable function value merely because a unique FunctionDeclaration exists. FunctionDeclaration bindings are mutable. The prototype's separate private-function-use scan may correctly refuse to mark `getExternal` itself private, but that does not stop the call-summary map from trusting its original AST body.

## Required correction

Call-target summaries require both lexical binding identity and stable value provenance. For a FunctionDeclaration, inspect all writes/read-write references to its binding and prove the reaching callable at each call site; absent that proof, classify the call as unknown. A conservative first gate can reject a target with any non-initialization write in the source unit. A full solution needs control-flow/reaching-definition analysis to distinguish unreachable or post-call writes without unsoundly accepting earlier or transitive mutations.

This is separate from the out-of-scope nested-decoy counterexample in `im-results/agent1-out-of-scope-call-target-counterexample-2026-11-24.md`: one falsifies lexical scope resolution; this one falsifies stable callable-value resolution even when the declaration is in scope.

## Evidence boundary

The Node reproduction proves that a FunctionDeclaration binding can be reassigned and that the host callback captures the active `hidden` source. The conclusion that the experimental guard misclassifies the call is a static trace of its source code; this report does not claim a full obfuscator execution or measured property metrics. No production source or candidate branch was changed.
