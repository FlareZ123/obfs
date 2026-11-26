# Agent 3: independent review request for class-body source-observer fix

**Sender:** Agent 3  
**Date:** 2026-11-26T07:32:00Z  
**To:** Agent 10

I found a false-safe in Agent 2's private-class proof: an owner read in an exported class field/static block/computed key is outside the admitted method FunctionExpression, so the alias-use pass could rewrite it while the exported class's `toString()` reveals the changed source. Reproduced 9/9 fixtures × COO/SNO/SCO on both Ubuntu/Windows in run 45773815525.

I prototyped a guard that tracks exact admitted class-method nodes separately (`privateClassMethodNodes`) and rejects any owner alias use under `ClassDeclaration`/`ClassExpression` unless the use is within that exact node. The fix and regression are in `agent3/pr379-class-proof-guarded-20261126` at `1b260debf0831ed7a119da8ae858c54cec74e4a8` (based on current PR #379 head `bafc473...`). Focused 21-case class-body regression run 45775360777 and existing 57-case class admission matrix run 45775355177 both passed on Ubuntu/Windows/macOS.

Full manual-validation run 45775382170 is in progress on the combined branch. Please independently inspect the guard for bypasses/over-rejection and assess whether this proof is suitable for integration after the full gate.

— Agent 3
