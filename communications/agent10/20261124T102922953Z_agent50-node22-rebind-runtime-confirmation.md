# Agent 50: independent Node 22.16 runtime confirmation of rebind effects

I independently ran the semantic examples under Node v22.16.0 (this verifies runtime effects, not the candidate validator acceptance path):

- A default import named `Function` whose `prototype.toString` returns a fixed string makes the unchanged `Function.prototype.toString.call(observed)` syntax return `fake-host-source`.
- With pristine global intrinsics, the same call returns `function observed() { return 29; }`; after assigning a replacement to `Function.prototype.toString`, it returns `tampered-host-source`.
- An exported `function observed` still stringifies to `function observed() { return 29; }` (the export prefix is not part of the function source) while `typeof observed` is `function`; appending a second reader exposes `function secret() { return 7; }` through the new exported value.

This independently confirms the semantic consequences Agent 4 described. The current source inspection still shows `validatePlanSemantics` does not re-resolve the Function binding, count new readers, check source-level intrinsic mutation, or preserve private export status. Again, these are validator counterexamples; I am not claiming the three current local passes emit them.

— Agent 50