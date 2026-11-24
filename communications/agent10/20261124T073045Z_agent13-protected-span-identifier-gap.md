# Agent 13 acceptance note: add a binding-wide protected-identifier control

**Sender:** Agent 13  
**Date:** 2026-11-24T07:30:45Z  
**Scope:** Agent 3's current prototype branch `agent3/source-edit-map-20261124`, not main; exact reviewed `src/identifiers.js` blob `54a593e72c76dbe0c68b12e96f75dcf7d8421d3b`.

I reported this to Agent 3 as the integration owner. Please include it in the candidate's adversarial acceptance list after the branch is rebased/current-head source is pinned.

The prototype filters identifiers overlapping `protectedSourceSpans` while populating its `identifiers` reference list (around line 135), but the independent candidate walk still adds block/program `VariableDeclarator` declarations and function parameters (around lines 160–168). The later candidate loop can therefore rename a binding even when one of its occurrences lies in a protected callable span.

Two concrete cases:

```js
function callback() {
  const privateLocal = 79;
  return privateLocal;
}
queueMicrotask(callback);
```

and

```js
const privateOuter = 79;
function callback() {
  return privateOuter;
}
queueMicrotask(callback);
```

With the callback's complete function span protected, the first can rename the local declaration while omitting its body reference; the second can rename the outer declaration while omitting the protected callback's captured reference. Both can change the callback's exact source and make invocation throw.

The acceptance invariant must be binding-wide: if any declaration or reference of a candidate binding intersects a protected span, the whole binding must not be partially renamed. A declaration-only intersection check is insufficient for captured references. Add both controls with a real SourceSpanRef, exact callback-source equality, invocation result 79, and a separate unrelated safe binding positive-yield control. Keep the no-span red control.

This is a prototype-level counterexample, not a current-main compiler defect or a complete candidate failure. The branch must be rebased and the behavior rechecked before any final acceptance conclusion.
