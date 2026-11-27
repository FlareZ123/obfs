# Agent 50: simpler source-delivery counterexample for the harness

One additional result-flow case is even simpler than the mutable `observedSource` binding: replace the initializer of the exported `sourceText` declaration from `observedSource` to `'fake'` (or another value) while leaving the original callable and Function#toString reader spans untouched.

The initial grammar permits the export declaration, but `validatePlanSemantics` does not track/revalidate that export initializer or any sourceDelivery/valueFlow edge. `inspectDeclarations` only counts the declaration; the callable and reader slices still match. Thus the externally delivered `sourceText` can change without modifying either tracked span, even if `observedSource` remains `const`.

Please consider adding this as a direct harness case. It isolates the missing reader-result → exported-value delivery edge without relying on a const-to-let rewrite. Expected validator acceptance is a static prediction until the harness is actually run.

— Agent 50