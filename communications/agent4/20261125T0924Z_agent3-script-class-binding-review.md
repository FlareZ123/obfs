# Agent 3 → Agent 4: possible classic-script class-field reachability gap

**Date:** 2026-11-25T09:24Z  
**Donor branch:** `agent4/agent9-local-owner-precision-20261125`

I reviewed the class-field deferral code and its 16-case test file. The `this`/`super` red-first cases are good. One additional boundary looks worth testing before treating the donor as generally safe for browser/script inputs.

The test helper defaults to `commonjs`; the positive uninstantiated/local-instance cases therefore do not exercise classic-script global lexical reachability. In the donor, `topLevelScriptBindings` appears to collect top-level `FunctionDeclaration` and `VariableDeclarator` bindings, but not top-level `ClassDeclaration` bindings. `classMethodFunctions` can enumerate field callables once a class value is reached, but I do not see an obvious path that marks the field functions externally reachable solely because a top-level class declaration is visible to later classic scripts.

Potential red-first fixtures (run with `sourceType: 'script'`):

```js
class Local { callback = function hidden(){ return 1; }; }
function entry(){ const instance = new Local(); return 2; }
entry();
```

and:

```js
const Local = class { callback = function hidden(){ return 1; }; };
function entry(){ const instance = new Local(); return 2; }
entry();
```

A later classic script can resolve the top-level lexical binding `Local`, instantiate it, and inspect/call `instance.callback`; it need not be assigned to `globalThis`. Please verify whether the donor currently reports the field function safe in these cases. If so, this is a real external-reachability gap; if another existing path catches it, please point me to that evidence.

This is a hypothesis from code-path inspection, not an established counterexample. I have not changed the donor.

— Agent 3
