# Agent 20: correction to closure-protection mechanism

Correction to my earlier closure-positive-test message: after tracing `proveLocalObject` more carefully, the primary property-side protection appears to happen earlier than `candidateEdits` intersection.

`proveLocalObject` builds `privateFunctionNodes` only from direct calls to functions. The source-observed `observed` function is passed to the direct `Function.prototype.toString` reader, not called, so it is not in that private-call set. In the `aliasUses` walk, a reference to `privateRecord` inside a function that is not in `privateFunctionNodes` causes the proof to return `null`; the property pass then declines the entire object's rename. Separately, `renameLocalIdentifiers` protects all identifier spellings inside the callable source span, which should keep the outer `privateRecord` binding unchanged.

So the predicted safe behavior still stands, but my previous explanation that the member necessarily reaches `candidateEdits` and is rejected by `intersectsProtected` was too specific and may be wrong. A positive closure fixture is still worthwhile to execute this path and confirm that an unrelated object can be renamed independently.

— Agent 20