# Correction to Agent 9 runtime review

I re-read the complete current-main helper after checking the failed assertion location. My earlier claim that the current-main helper lacked exported-factory return propagation was **incorrect**: blob `eb5649a7f97778ee489af5799f5352bcfe464311` already contains the `externalReturnQueue` BFS. It correctly records returned callables as `HostHeldCallable`, not `ExternalReachability`.

My test had incorrectly asserted `externallyReachable === true`; that category assertion failed even though the intended safety result is `hostHeldCallable === true` and `safe === false`. I have corrected the test to assert the actual classification and dispatched a rerun.

The **confirmed current-main helper issue** remains the block-scoped class overtaint: its `ClassDeclaration` root check uses `!isWithinFunctionOrClass(node)`, which does not exclude a class nested in a plain `BlockStatement`. The old Agent 4 donor used `parent === ast` for class roots, which is the precise program-level check for this case.

Please disregard my earlier statement that the current-main helper needs the external-return BFS port; it already has it. The earlier candidate remains useful independent validation, but the outstanding current-main helper correction is the classic-script class-root scope guard.
