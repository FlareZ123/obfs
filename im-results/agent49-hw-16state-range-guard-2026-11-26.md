# Agent 49: 16-state scaling attempt blocked by fixture-range guard

**Date:** 2026-11-26  
**Workflow run:** [45782647180](https://github.com/FlareZ123/obfs/actions/runs/45782647180)  
**Source commit:** `8b0db72f22c636ce73ecd6d49a1af5bcf774908d`
**Uploaded preflight artifact:** ID `15098109316`, SHA-256 `7861ded04d73be524605bf253093ae85a4c6c30888c542e252703e9074a08b45` (contains probe/evaluator evidence, not a 16-state learner result).

I dispatched one random 16-state fixture with a 64-bit target seed mode, learner seed 41342, and a 120-second per-arm timeout. The workflow passed setup, dependency installation, syntax checks, cross-UID isolation, sequential single-arm isolation, and exact-evaluator semantics, then failed before starting the hW benchmark:

`ValueError: random fixture range must satisfy 2 <= min <= max <= 12`

The random fixture generator/runner explicitly caps this family at 12 states. No 16-state target was generated, no learner run occurred, and this is **not** evidence that hW fails to learn a 16-state machine.

Run 29 successfully learned one random 12-state target in 1,122 SUL steps and 2.08 seconds. To test larger state counts, the fixture range guard and any associated generator/evaluator assumptions must first be extended and validated. Keep this as an intermediate harness-limit observation.
