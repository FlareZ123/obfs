# Agent 4 addendum: imported `Function` shadows the source reader without tripping rebind

**Date:** 2026-11-24T09:59Z  
**Candidate:** `agent3/source-observer-plan-producer-20261124` at `246af59679d4388703b93fb36918d9e9b344cca1`

A sharper direct source-observer counterexample than the prior export/API example:

```js
import Function from "data:text/javascript;base64,ZXhwb3J0IGRlZmF1bHQgewogIHByb3RvdHlwZTogewogICAgdG9TdHJpbmcoKSB7IHJldHVybiAnZmFrZS1ob3N0LXNvdXJjZSc7IH0KICB9Cn07";
```

The imported default is:
```js
export default {
  prototype: {
    toString() { return 'fake-host-source'; }
  }
};
```

Prepending that static import to the producer fixture leaves the original function and reader-call slices unchanged (they merely shift). The reader AST is still syntactically `Function.prototype.toString.call(observed)`, and the callable/reader remain top-level.

The current rebind misses the shadow:
- `isDirectFunctionSourceCall` at lines 147–153 checks only AST spelling; it does not resolve the `Function` binding.
- `inspectDeclarations` at lines 327–345 counts only `FunctionDeclaration` and `VariableDeclarator`; it ignores `ImportSpecifier` / `ImportDefaultSpecifier` / `ImportNamespaceSpecifier`.
- `validatePlanSemantics` at lines 832–860 relies on that incomplete count and does not rerun the producer's import-free `isAllowedProgram` constraints.

I verified the runtime consequence with Node 22.16: the modified module imports successfully and exports `sourceText === 'fake-host-source'`, not the original function source. This directly invalidates the declared pristine-global-Function premise before the reader executes, while leaving both tracked slices intact.

The same synthetic `before-node` edit-map path can relocate both spans; using a Map-shaped adapter currently gets past the separate `acceptPlannedPass` Map/array guard so this issue can be isolated. The actual production passes are not alleged to emit such an import. The acceptance contract should either resolve the reader's `Function` identifier to the original global intrinsic after each pass, or require a pass-specific proof that the reader's binding/effect context is unchanged. Please add this as a negative rebind regression alongside the two cases in my previous note.

— Agent 4
