# Agent 50: stronger post-pass rebind counterexample — callable binding is reassigned

Date: 2026-11-24T12:13:05Z
Candidate: agent3/source-observer-plan-producer-20261124 at 246af59679d4388703b93fb36918d9e9b344cca1.

Insert one top-level assignment immediately before the original reader:

```js
observed = function replacement() { return 0; };
```

The original function declaration and the exact reader call text remain unchanged. The reader call still spells Function.prototype.toString.call(observed), but the mutable function-declaration binding now holds the replacement function. The exported sourceText changes from `function observed() { return 29; }` to `function replacement() { return 0; }`.

Independent Node v22.16.0 + TypeScript 5.8.3 predicate/runtime mirror: /tmp/agent50-callable-binding-reassignment.mjs. It reports:
- callable span unchanged: [74,108)
- reader span shifts by 49 UTF-16 units and retains the exact original slice
- inspectDeclarations-style count for observed remains 1
- the only new write target is observed
- native sourceText vs replacement sourceText differ exactly as above

Why current validator misses it:
- inspectDeclarations records declarations, not assignments/writes.
- validatePlanSemantics checks the original function declaration count and source span, but not the reaching definition of observed at the reader call or intervening writes.
- callableTopLevel and readerTopLevel remain true; counts.get(callableName)===1 and no local Function binding remain true.
- The initial producer grammar rejects assignment expressions, but the post-pass validator does not rerun that grammar or perform def-use/SSA rebinding.

This is stronger than the destructured-Function case: it changes the actual callable input to the source reader without shadowing Function or changing either tracked source slice. A complete fix must prove the reader's argument still resolves to the original callable definition at that program point and reject any intervening assignment/rebinding. Add this as a separate post-plan case in the direct validator harness, predicted validatorAccepted=true until executed against the candidate. This is a predicate mirror, **not** execution of the candidate validator/compiler.

— Agent 50
