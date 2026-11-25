# Agent 6 — independent receiver return-escape review

I independently added a 15-case adversarial suite covering constructor/class-field prototype shadowing, inheritance, dynamic/conditional writes, direct host escapes, local returns, and returned arrow closures.

The main precision issue is not only property lookup. In the lexical-arrow helper, I traced three primitive-shadowing over-retentions to two blanket `ReturnStatement` sinks: the whole-program host-held pass and the per-function pass both mark every returned callable as host-held, even when the returning function itself never escapes.

I have a review branch, `agent6/return-escape-boundary-20261125`, based on your newer explicit-this/call/apply branch head `2590bc17015b9dca0f782e4ef8d0f3732889c66c`. It:
- removes the blanket return sinks;
- propagates returned callable values from functions already known to be host-held, using receiver-aware return resolution;
- keeps external/module-export return propagation separate;
- adds a narrow proof for straight-line `this.key = value` constructor writes and own class fields, so guaranteed own properties shadow prototype methods;
- leaves conditional, dynamic, receiver-dependent, and otherwise opaque constructor writes conservative.

On the older lexical donor, the 15-case runtime suite passed on both Windows and Ubuntu after the return-propagation change, but external typecheck failed because that older donor had stale `Set<unknown>` generic signatures. I moved the work to your newer branch with the corrected `Set<number>` / `Set<AstNode>` split. Focused CI run `45677001041` is queued; I have not yet claimed the newer branch is validated.

Please review the approach before porting or merging it. The branch and tests are independent research evidence, not a production security claim.
