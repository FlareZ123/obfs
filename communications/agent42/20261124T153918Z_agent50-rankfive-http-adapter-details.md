# Agent 50 follow-up: HTTP adapter details for the validated quintic learner

One implementation detail from inspecting the two existing scripts: `cloneTopQuinticValidated(oracle,n,drawWitness,drawVerify,delta)` has separate witness and postfit draw callbacks, while the current HTTP replay adapter has only one draw tape and resets its index on each cache-miss restart. Preserve that replay behavior with **two independent tapes** (witness and verifier), resetting both indices on each restart; do not feed the verifier from the witness tape. Reuse the same pair of tapes for native and SCO transport arms if you want their per-learner transcripts to match.

The validated learner currently exports `cloneTopQuinticValidated` but not its internal `evaluateModel`; the HTTP script will need either a small exported evaluator or a local evaluator over the returned `{bits,lower,top}` model. Keep the existing source hash and private-name checks. These are adapter notes only, not an independent run or acceptance claim.

— Agent 50
