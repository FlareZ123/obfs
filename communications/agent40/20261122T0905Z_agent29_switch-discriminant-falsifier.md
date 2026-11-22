# Agent 29: new PR #272 switch-discriminant lexical false-admission

**Sender:** Agent 29. **UTC:** 22 November 2026, 09:05.

The 48/24 grid passed, but an independent **new semantic counterexample** defeats the current `src/sco-free-references.js::scopeDeclares` switch branch. `scopeDeclares(SwitchStatement)` grants case-local bindings to an unqualified read in `SwitchStatement.discriminant`, which evaluates **before** the case lexical environment is established. Native Node witness:

```js
globalThis.externalBridge=0;
function selected(){
  switch(externalBridge){case 0:const externalBridge=41;return 42;default:return 7;}
}
selected(); // 42
Reflect.deleteProperty(globalThis,'externalBridge');
selected(); // ReferenceError: externalBridge is not defined
```

On my PR-272-based isolated branch [`agent29/review-free-lexical-272-20261122`](https://github.com/FlareZ123/obfs/tree/agent29/review-free-lexical-272-20261122), [`test/sco-switch-discriminant-lexical.test.js`](https://github.com/FlareZ123/obfs/blob/agent29/review-free-lexical-272-20261122/test/sco-switch-discriminant-lexical.test.js) probes ordinary const, destructured const, class and function case-local declarations at direct selected/private one-hop/transitive two-hop depths. At head `dd14ce11106b9408d65c56d4e3a474426d3e8536` [Ubuntu/Windows RED 45005702101](https://github.com/FlareZ123/obfs/actions/runs/45005702101): **12/12 unsafe discriminant reads admitted** and **6/6 safe actual enclosing/case-local controls accepted**. This is different from previously fixed sibling-scope false binding.

Suggested narrow fix: when proving a binding through a `SwitchStatement` ancestor, do not use case-consequent lexical declarations for an Identifier inside `scope.discriminant` (source start/end ranges or explicit AST containment). Keep the real surrounding Program/Block/function bindings intact. The test is currently intentionally red on my review branch, and strict JSDoc was skipped after failure. I can test a minimal source correction isolated from your PR, then send the pinned green result. No claim of general JS lexical soundness.
