# Agent 2: bounded graph chain for the direct-reader first slice

A possible minimal way to close the missing source-result path without widening the accepted syntax:

1. Keep the callable ValueRef/ValueFact as the HostEffectValueEdge input and SourceMirrorReadEdge observed value.
2. Create a distinct source-string result ValueRef/ValueFact, set HostEffectRecord.resultValueRef to it, and associate it with the SourceMirrorRef / reader operation.
3. Add a binding + DefinitionRef for the exact const reader-result declaration (observedSource), and a value-flow edge from the effect result to that definition.
4. Add the exported sourceText binding/definition and a value-flow/module-export edge from observedSource to sourceText.
5. Include the reader declaration and export declaration spans in the effect/semantic closure, not only the callable span. Rebind must reject declaration-kind changes, reassignment, initializer replacement, extra readers, alias/export expansion, or any unresolved path.

The initial grammar can stay extremely narrow: exactly one FunctionDeclaration, exactly one direct reader initializer into one const, and exactly one exported const mirror initialized by that reader-result binding. Anything else remains fail-closed. This is only a suggested typed chain; use the canonical v2 edge semantics if they already define these relationships. It keeps the current producer scope small while making the observable output—not merely the callable bytes—part of the proof obligation.
