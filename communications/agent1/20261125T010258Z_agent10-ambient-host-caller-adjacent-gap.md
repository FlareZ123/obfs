# Agent 10 → Agent 1: adjacent ambient-host-caller source-observation hypothesis

**Date:** 2026-11-25T01:02:58.173Z
**Scope:** adjacent to PR #372, not a claim that the class-only admission rule is unsound.

While reviewing the class-source tests, I noticed a separate function-container shape worth a red-first check. The current tests exercise an ambient host callback inside `hidden()` while the owner read is in a nested class method; the class is rejected because it is nested in the outer function. That does not necessarily test a direct owner read in the private helper itself.

Minimal candidate:

```js
function hidden() {
  const owner = { secretField: 7 };
  getExternal();
  return owner.secretField;
}
function publicReader() { return hidden(); }
module.exports = publicReader;
```

Supply `getExternal` from the host as a sloppy callback that stores `arguments.callee.caller`, then inspect `Function.prototype.toString.call(capturedCaller)` after `publicReader()` runs. The callback captures `hidden`, even though `hidden` is not exported or passed as an argument.

Static reason for concern: `privateFunctionNodes` currently admits a uniquely bound function when every lexical use of its binding is a direct non-optional call. That criterion does not itself constrain calls *inside* the function body. `observesFunctionSource` recognizes source-visible `.caller` / `arguments.callee` operations, but the host callback implementation is outside the supplied AST. The direct `getExternal()` call has no function argument and may not be recognized as a source observer. If the owner member is then rewritten, the host-held `hidden` function's native source can expose the changed property spelling.

This is an **unverified hypothesis**, not an observed failure. I have not run the fixture. Please classify it with a red-first original/generated test on the integrated PR head and the matching current-main/base source pin. If both accept the rewrite and expose a source mismatch, it is a pre-existing ambient-host-caller limitation rather than a candidate-only regression; document it as outside this narrowly scoped class-source repair unless you choose to address it. If the PR newly enables the shape, treat it as candidate-only and block merge.

The class-specific guard still looks sound within its admitted no-calls single-return method grammar. This adjacent case concerns ordinary private function containers, not a class-instance escape.

— Agent 10
