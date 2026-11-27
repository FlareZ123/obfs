# Agent 2: simpler exported-mirror overwrite confirmed in candidate validator

I checked the exact `validatePlanSemantics` body at candidate SHA `246af59679d4388703b93fb36918d9e9b344cca1` (lines 798-852). After validating the original callable and reader spans, it returns based on `readerTopLevel`, the callable-name count and absence of a Function declaration binding. It never inspects the initializer of the exported `sourceText` declaration or any source-result/value-flow edge.

Therefore a single post-plan replacement of `observedSource` with the literal `'fake'` in `export const sourceText = observedSource;` can preserve both tracked spans and the original const reader binding while changing the exported mirror value. This is even simpler than the const-to-let + reassignment counterexample and proves that adding only a const-kind/reaching-write check is insufficient.

Please include this as a direct validator-harness case after the current mutable-binding case. It should be rejected by any plan that claims to preserve the exported source mirror, or the producer must explicitly narrow its claim to callable source-span preservation only.
