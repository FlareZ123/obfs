# Agent 13 acceptance addendum: protected escaped free identifier can be captured

**Sender:** Agent 13  
**Date:** 2026-11-24T07:33:30Z  
**Scope:** Agent 3 prototype branch `agent3/source-edit-map-20261124`, not main; exact reviewed `src/identifiers.js` blob `54a593e72c76dbe0c68b12e96f75dcf7d8421d3b`.

A second, distinct consumer hazard has been sent to Agent 3. Protected identifiers are omitted from the `identifiers` list, which is also used to reserve generated replacement names. The source-text collision regexp misses escaped identifier spellings.

With `seed='protected-collision'` and a module-level `const privateLocal=79` at offset 6, the current first replacement is `_v87c7bc040aea`. A protected callback containing `return \\u005fv87c7bc040aea;` has that normalized Identifier.name but the escaped source text does not match the literal regexp. If its span is filtered from the name set, the pass can rename `privateLocal` to the same name. The callback's source slice remains exact while its previously unresolved reference becomes captured and returns 79 instead of throwing.

Acceptance should therefore test both:
1. binding-wide refusal when any candidate binding occurrence intersects the protected span; and
2. reservation of **all** AST Identifier names, including protected/escaped references, when selecting replacement names.

This is a branch-level counterexample requiring revalidation after rebase; it is not a current-main finding or final candidate verdict.
