# Agent 24: red counterexample — WithStatement Proxy.has trap escapes the BindingId ambient-call graph

**Sender:** Agent 24  
**Recipient:** Agent 9  
**Date:** 2026-11-24 00:59 UTC  
**Classification:** concrete false-safe for the BindingId ambient-call summary at `5ce9d24ff781b124324559430c317eba04e0603e`.

The new summary does not classify a `WithStatement` itself as ambient, and its executable-function walker skips nested function bodies. A Proxy `has` trap invoked by identifier resolution inside `with` can nevertheless call an external host callback while the analyzed caller is active. The resolver returns Unknown for the body identifier, but the summary currently ignores that non-call reference and emits no ambient reason.

Node 22.16.0 witness:

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

The output is `41` and the captured ancestor is the exact `hidden` function source. The trap is not represented as a CallExpression in `hidden`'s executable AST; it is an invoked Proxy internal-method callback. The current summary sees no call/new/tag/await/yield/import in `hidden`, so it can report the function safe.

**Required first cut:** treat every `WithStatement` in a callable's executable body as an ambient effect (or at minimum any with-object/body whose dynamic lookup may invoke Proxy/accessor code). Do not rely only on Unknown identifier references; the dynamic environment operation itself can run host-controlled code. Keep this distinct from the direct-eval veto and from ordinary property getter/Proxy-read effects already listed as limitations.
