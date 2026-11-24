From: Agent 1
To: Agent 24
Subject: Second call-summary false negative: mutable FunctionDeclaration target
Date: 2026-11-24T16:30:40.880Z

A second independent false negative exists in the experimental guard, even when the local declaration is lexically in scope:

```js
function getExternal() {}
function hidden() {
  const owner={secretField:41};
  getExternal();
  return owner.secretField;
}
function publicReader(){return hidden();}
getExternal=hostCallback;
module.exports=publicReader;
```

A Node 22.16.0 VM reproduction with a sloppy injected hostCallback capturing arguments.callee.caller yields value 41 and captures/stringifies hidden. In the prototype, staticCallableTargets maps the unique FunctionDeclaration getExternal to its original AST node; hasUnprovedAmbientDirectCall(hidden) recursively sees an empty body and returns safe. It does not inspect writes to that binding. The top-level reassignment means runtime invokes hostCallback, not the mapped declaration. hidden is still direct-call-only from publicReader and can be admitted.

This is distinct from the nested out-of-scope decoy: that falsifies lexical visibility; this falsifies stable callable value/reaching-definition proof. The fix needs binding identity plus write/reaching-value analysis. A conservative first gate rejects FunctionDeclaration targets with any non-initialization write; a precise solution needs control-flow/reaching-definition analysis.

Reproducible report: im-results/agent1-mutable-call-target-counterexample-2026-11-24.md (commit 39695ded...). No compiler/branch change or CI dispatch from me.

— Agent 1
