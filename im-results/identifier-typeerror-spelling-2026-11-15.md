# Observable V8 TypeError binding spelling: compatibility guard and measured coverage

Date: 2026-11-15. Agent 49. **Intermediate compiler correctness research**, not a new obfuscation security claim.

## Reproduction

- Implementation: [src/identifiers.js](../src/identifiers.js)
- Focused Node regression: [test/identifier-typeerror-spelling.test.js](../test/identifier-typeerror-spelling.test.js)
- Existing manual Linux and Windows integration: [.github/workflows/manual-transform-safety.yml](../.github/workflows/manual-transform-safety.yml)
- Final pinned green cross-platform run [43713066106](https://github.com/FlareZ123/obfs/actions/runs/43713066106) at commit **9161c690a85afe2b4bbf5fe6f3d552b11110a393**; all focused and surrounding semantics checks passed on both systems, root JSDoc check passed.

## Bug and threat to 1:1 JavaScript behavior

The baseline lexical identifier renamer renamed a uniquely bound local variable without recognizing that V8 occasionally embeds the original identifier spelling in a thrown TypeError. These error messages are observable to JavaScript, particularly when an application catches them and saves error.message. The transformed program can therefore behave differently even when all lexical references are rewritten consistently.

Representative native V8 messages:

| Original code shape | Native message contains |
|---|---|
| Constant numeric variable called as function | "invalidCall is not a function" |
| Numeric member called as function | "receiver.act is not a function" |
| Numeric variable constructed with new | "badConstructor is not a constructor" |
| Scalar spread into an array | "badIterable is not iterable" |
| Scalar for-of source | "iterableSource is not iterable" |
| Nullish object destructuring | "Cannot destructure property 'entry' of 'nullishSource' ..." |

The regression tests compare the *actual caught message* from the original and emitted CommonJS using the native Node VM, rather than comparing only thrown error classes.

## Implementation and proof boundary

The renamer now records error-sensitive binding roots for direct calls, constructors, tagged templates, iterable spreads, for-of, delegated yield, and array/object destructuring. It conservatively declines to rename a candidate when a relevant AST reference can affect a V8 error string. Member chains are traced to their root identifier; the existing lexical uniqueness, dynamic scope, TDZ, named evaluation and scope containment guards continue to apply.

The new guard deliberately distinguishes object spread from array/call spread: object spread accepts nullish source values and does not invoke the iterator protocol, so it does not itself justify suppressing the source identifier.

A second narrowly proven relaxation preserves renaming of a direct **const object-literal source** used in object destructuring. Such a binding has a nonnull object identity throughout its lifetime; nullish source TypeErrors whose text includes that binding therefore cannot occur at that use. Mutable and unproven RHS sources remain protected.

This is a restricted syntactic analysis, not a complete formal characterization of every host engine's TypeError spelling. JavaScript engines differ in diagnostics. Future changes must preserve the actual caught-error differential and report positive rename coverage instead of merely growing the blocked sink set.

## Pinned validation and coverage denominator

The final focused file contains **13** cases: **10** dangerous error-spelling situations and **3** positive transformation controls (proven nonnull const object, noniterating object spread, arithmetic-only binding). On the pinned green run, all new cases plus the existing TDZ identifier tests, source-observer coverage checks and JSDoc checks passed on both Ubuntu and Windows. Safe arithmetic still emits one renamed binding; the other two positive controls assert at least one renamed binding and disappearance of the eligible original source name. The ten negative cases assert native result equality and preservation of the error-sensitive spelling.

A prior focused run [43712153254](https://github.com/FlareZ123/obfs/actions/runs/43712153254) at commit ee5039ac96c passed the initial seven cases on both runners. An intervening concurrently modified property-pattern test generated a red [run 43712570476](https://github.com/FlareZ123/obfs/actions/runs/43712570476) at 0954f142, failing one older property-coverage assertion in each OS. The overlapping property owner subsequently repaired that regression, and the last focused gate at 9161c690 is green. Preserve that historical red case in the record; it was not evidence that the error-spelling cases failed.

## Limits

- Error messages may reference other original source expressions, including reflective host APIs, aliases and call chains not fully modeled here. This fix does not prove whole-program observational equivalence.
- The pattern analysis deliberately leaves some eligible identifiers unchanged. A later proof may safely recover them, but should measure and explain the difference.
- Renaming/de-renaming output has virtually no additional runtime work by design; this experiment does not measure the 2.5× performance constraint or demonstrate greater attacker resistance.
- Existing source-only renaming normalization and complete attacker control of COO/SNO persist. Repairing diagnostic compatibility is essential for a correct compiler but is not a security result.

## Decision

Keep the AST-directed conservative error-spelling guard and its positive controls. When evaluating a future renamer, compare native caught messages alongside return values and outputs; otherwise apparently successful identifier rewriting may be observably wrong. Defer any broader error-source observation claims until independently reproduced across engines.
