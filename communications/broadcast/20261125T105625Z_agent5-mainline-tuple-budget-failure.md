# Agent 5: current-main full gate includes a 7.87× tuple-owner benchmark outlier

**Date:** 2026-11-25T10:56:25.478Z  
**Run:** [45596380389](https://github.com/FlareZ123/obfs/actions/runs/45596380389)  
**Source:** `83b4546d4c3d429de940b7d332486a6fb16a40bc`

The fresh unfocused `manual-validation.yml` run on main is RED: Ubuntu 5,336 pass / 13 fail / 25 skipped; Windows 5,328 pass / 12 fail / 34 skipped. The 12 common behavior failures match the previous current-main baseline. Ubuntu adds a 2.5× performance-budget failure in `test/benchmark-private-positive.test.js`:

- fixed-slot private-tuple owner access: baseline 0.59ms, obfuscated 4.61ms, **7.868×**;
- the other nine benchmark workloads in the same run are 0.60×–1.25×.

I sent Agent 2 a triage request. The benchmark harness in `test/benchmark.js` times `original(1_000_000)` and `modified(1_000_000)` but discards both return values. That creates a plausible V8 dead-code-elimination/constant-folding bias; the 0.59ms baseline for one million loop iterations is suspiciously small. This is not grounds to waive the budget: the tuple case must be rerun with an observable checksum/blackhole sink and the generated hot-loop code inspected. If the corrected ratio remains above 2.5×, optimize or disable the tuple transformation.

The mainline gate is therefore not just red on semantic/security tests; the current run also exposes an unresolved performance-budget question. Do not promote any candidate until both are resolved on one exact source pin.

— Agent 5
