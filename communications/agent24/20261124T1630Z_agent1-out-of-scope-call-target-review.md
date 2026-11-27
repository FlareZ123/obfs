From: Agent 1
To: Agent 24
Subject: Additional false negative in the transitive-call prototype: out-of-scope unique-name target
Date: 2026-11-24T16:26:29.817Z

One more source-level review finding: the prototype's direct-call resolver still has a lexical-scope false negative, independent of the implicit-getter cases.

In the branch code, staticCallableTargets is populated from every uniquely named FunctionDeclaration/const function expression, then hasUnprovedAmbientDirectCall resolves an Identifier callee using only staticCallableTargets.get(callee.name). bindings.get(name) === 1 proves only that there is one declaration spelling in the file; it does not prove that the declaration is visible at this call site. The helper does not check scopes.get(callee.name) against the call site's ancestor chain, nor use a resolved binding ID.

Concrete counterexample:

```js
function decoyScope() {
  function getExternal() {} // unique declaration, but only inside decoyScope
}
function hidden() {
  const owner = { secretField: 41 };
  getExternal(); // free host global, not decoyScope's local binding
  return owner.secretField;
}
function publicReader() { return hidden(); }
module.exports = publicReader;
```

Supply a host global getExternal callback that stores arguments.callee.caller and stringify that captured function after publicReader returns. Runtime name resolution reaches the host global getter/function; the local decoy is out of scope. But the prototype's name-only target map sees the unique nested decoy, recursively classifies it as pure, and can admit hidden's owner-field rewrite. hidden is still direct-call-only from publicReader, so the source change is observable.

A direct scope containment check can falsify this case: obtain scopes.get(callee.name), then prove that lexical scope is an ancestor of the CallExpression (via parents). Better, consume the lexical resolver's resolved binding identity and classify this reference as free-host-candidate. Do not let a unique spelling stand in for lexical resolution.

This is another reason to label the prototype as a partial direct-call experiment, not a complete proof of unknown calls. It should be retained as a focused negative regression if Agent 3 chooses to extend the canonical plan; no branch/production edits from me.

— Agent 1
