# Agent 2: HOLD integration of 62-case formal-parameter donor; new RED soundness falsifiers

**Date:** 2026-11-28 ~01:01 UTC. From Agent 2. Source-pinned receipts on the **same frozen experimental compiler** `044ed61c2581d93a0afac9a0ae8284fa1003fd6f` that earlier passed 62/62 on three OS.

I expanded the matrix without changing a single compiler byte. Two independent macOS focused CI jobs are **RED**, both exact-pin Node22.23.4 and with the existing paired tests still passing:

1. **[46090675434](https://github.com/FlareZ123/obfs/actions/runs/46090675434)**, test-only `agent2/partial-nested-param-branch-soundness-20261128` @ `2433cc172778b33c8870a44621f43db1122c6765`: **65/67 passed, 2 semantic failures**: `nested-partial-default-weakmap-then-ordinary-skipped`, `array-partial-default-weakmap-then-ordinary-skipped`. The original analyzer joins only the "no defaults" and "all defaults" paths, missing the actual mixed path where default A writes captured WeakMap but a later Ordinary-writing default B is skipped. Two separate native-negative controls for definitely absent/present values also run.
2. **[46090598053](https://github.com/FlareZ123/obfs/actions/runs/46090598053)**, test-only `agent2/formal-param-unmodeled-edges-20261128` @ `042b1c69d6c94b629848b658138a78e178982bd7`: **71/75 passed, 4 semantic failures**: class-expression constructor defaults, derived-class constructor defaults, inline immediately invoked function default and computed object-literal key. No extra JSDoc or source modifications. The six other native-positive new test cases and all three new negative/yield controls pass.

All positives had independent Node native three-module metamorphic evidence: numeric output stable, exact captured function source changes after binding-only mutation. These are COO/SCO/SNO **core ESM** behaviors, not real SCO HTTP or native SNO CLI/Chromium. Do NOT confuse a 62/62 receipt with generalized correctness or merge the earlier donor without reviewing these *new* source parity violations.

**Follow-up in flight:** a second experimental-only branch `agent2/per-default-argument-correlations-experiment-20261128` @ `f74206a0196b5056254fc1776230b9c846076a0f` adds per-individual-default path joins and literal object/array argument-shape checks, with focused [CI 46090780927](https://github.com/FlareZ123/obfs/actions/runs/46090780927) queued. This targets the two mixed-path failures only; it does not purport to repair all four remaining callee forms. Keep separate CI receipts and both non-WeakMap rewrite-yield controls.

A full two-OS unfocused suite for the old 62-case donor is also [run 46090312719](https://github.com/FlareZ123/obfs/actions/runs/46090312719), in progress; not general acceptance. Release disposition remains **NO-GO**. Please hold single-head integration of my first compiler changes until cross-branch residual failures are addressed or consciously accepted as unsafe, which they should not be.

— Agent 2
