# Shared-join CFG source-only reconstruction and scale

**Date:** 2026-11-17. **Classification:** Intermediate adversarial-method result. The attacker and tests have been committed; full cross-platform CI was queued when this note was written. This does not establish a protected-code secrecy or performance result.

## Problem and counterexample

The opt-in flattenStatementFlow backend in src/statement-flow.js emits randomized native switch-state graphs. Its independent source-only adversary, sims/statement-flow-recover.js, previously reconstructed each test by recursively visiting both child states to the final return. A chain of N sequential if/else diamonds has only O(N) source and dispatch states, but each diamond doubles the number of copies of its shared trailing suffix. The old visitor therefore emits 2**N copies of the final return, independent of whether the random state identifiers and case order are known.

This is an **attacker-tool scaling defect**, not proof that the generated program prevents static deobfuscation. A capable adversary can recognize shared successors rather than expanding every path.

## Patch

The committed visitor now memoizes graph reachability, computes each test's earliest common reachable successor, and emits both arms only up to their shared join. The shared suffix is printed once. The visitor respects an enclosing join when an inner arm ends with return or throw, so the continuing arm does not consume and repeat the enclosing suffix. For graphs with no uniquely ordered common successor, it conservatively falls back to arm-local expansion; the algorithm is intended for the acyclic, structured graphs emitted by this compiler, not arbitrary irreducible untrusted state machines.

Source changes:
- sims/statement-flow-recover.js, commits 7c31bc9559d8eadc07a3363015bba9e3a71acbae and fc27dcb470b9ef2c655d07329ba44e82c3c30792.
- test/statement-flow-recovery-scale.test.js, original commit 460d25006dce773750f3e4c37c5eb2e1241f08f8.
- sims/statement-flow-attack-scaling.js, original commit 47d68474f4ef40176cc5324c4800ecc7e363c69a.

The test checks 12 sequential diamonds and mixed nested early returns across 16 layout/compaction combinations. It compares native, generated, and recovered numeric results on the same inputs and caps recovered source growth. The stand-alone experiment scales through 3, 6, 9, 12, 20, 40, and 80 diamonds, with 41 equal-input parity checks per case and separate extraction time/byte measurements. It runs both ordinary and compacted native CFG modes. The 80-diamond case is within the compiler's 256-block admission cap.

## Independent local algorithm check

A separate Node 22 synthetic-graph exercise constructed 80 sequential diamonds (242 nodes including entry/return), applied the same join-aware traversal, and compared results over 200 consecutive input integers. The emitted reconstruction had 3,654 characters and the traversal took 14.34 ms on that local process. A 12-node graph with nested early exits also preserved the tested outputs. **These are checks of the traversal logic on manually constructed graphs, not of Acorn parsing, the actual transformed source, whole-application cost, or a hostile-browser threat model.** The committed corpus plus manually dispatched workflow are the integrated validation path.

## Security and runtime interpretation

This improvement makes the **source-only attack stronger and more scalable** against the public CFG layout. It does not increase the obfuscator's static resistance. The static source reconstruction is not identical to original source spelling, and source/stack observers remain outside this backend's native semantic proof. Generated CFG execution may violate the project 2.5x budget on cold or hot workloads; measuring the attacker offline is a distinct cost dimension. All claims remain bounded until the relevant CI produces a pinned result.

Manual workflow: .github/workflows/manual-expression-vm.yml, including Node 22 Ubuntu/Windows tests, JSDoc, a browser ESM fixture and the attack-scaling script. Initial dispatch run 44032889915 predates the final early-exit and scaling changes; later dispatch run 44033197513 includes the new files but was queued at this checkpoint.


## Pinned two-platform integrated result (06:56 UTC)

The full focused [run 44033197513](https://github.com/FlareZ123/obfs/actions/runs/44033197513) **passed** at exact commit 4e2f3db0901d2db89789cc4ead4500b7bc06dd5c. Node 22.23.4 on Ubuntu and Windows each ran **36 focused tests, all passed**, including native/C++-free CFG source reconstruction regressions. The job also executed the 14-case public-source-only extraction scaling script, strict main-library JSDoc, and a real Ubuntu Chromium fixture whose native and bytecode COO ESM graphs matched output 98.

For the largest 80-diamond function (242 compiler blocks), the genuine emitter produced 17,485 bytes in ordinary mode and 17,431 bytes in compact mode from a 3,574-byte original. The seedless recovered function was **3,654 bytes (1.02238x the original byte count)** in either mode, with 41 equal-input native/emitted/reconstructed checks per row. At that pinned source, static extraction times on the CI runner were:
- Ubuntu ordinary: **17.11 ms**; compact: **12.64 ms**.
- Windows ordinary: **7.95 ms**; compact: **4.79 ms**.

These single-run timings describe the attacker process, not application execution performance. They are neither an estimated statistical advantage over minification nor evidence that the 2.5x runtime budget is met. The scaling script's other six branch counts (3, 6, 9, 12, 20 and 40) completed on both OSes. The prior [run 44032889915](https://github.com/FlareZ123/obfs/actions/runs/44032889915) also passed Node/Windows/Chromium and JSDoc at its older pinned commit ad7a04dd0cb9a8ca492f3788adab401ff54cffee.

After this pin, a separate seeded random-join compiler regression was added in test/statement-flow-random-joins.test.js. Its current validation status is distinct from the above 36-test run; do not count it as covered by 44033197513.


## Seeded nested-return/throw and fully layered static clone (07:01 UTC)

The expanded integration [run 44035311664](https://github.com/FlareZ123/obfs/actions/runs/44035311664) **passed on Node 22.23.4 Ubuntu/Windows** at exact commit fbf631af523b9f0d5092dda6489f3d0b4d185990. Both jobs passed **38/38** Node subtests, strict main-library JSDoc, 14 CFG static-scaling rows, and the Ubuntu real-Chromium ESM page integration. This pin includes:
- test/statement-flow-random-joins.test.js: a deterministic xorshift-generated corpus of 160 original functions, two ordinary/compact variants per function, 9,280 equal-input native/emitted/recovered comparisons across nested joins, early returns and **primitive** throws.
- test/statement-flow-recovery-scale.test.js: after the initial 12-diamond/early-exit checks, a further full COO/SNO pipeline test with 12 sequential diamonds across both compaction settings and four seeds each, recovering functions from only delivered transformed ESM text after ordinary layers and selected host-locking.
- The earlier 80-diamond scaling experiment, typecheck, and Chromium exercise. Runtime 2.5x compliance remains unproven.

The predecessor [run 44035066453](https://github.com/FlareZ123/obfs/actions/runs/44035066453) at 6fb8c5dfdf0a4ccf1c27404d111a4c171eb02362 **failed 1/37** on both platforms because the generated fixture used new TypeError("bad"+y), which triggered the existing conservative function-source observer guard and declined selected CFG transformation at index 0. The fixture was changed to numeric primitive throws and retained exact thrown-value comparison. This was **not** repaired by disabling or weakening the compiler's observer guard. Subsequent 38/38 success validates the intentionally narrower supported input contract, not handling of all Error-constructing functions.

A separate paired native/ordinary/compact 80-diamond **hot-function plus cold vm.Script compilation profile** was committed as sims/statement-flow-diamond-runtime-profile.js. It checks exact native outputs and reports nine paired samples per workload without enforcing a universal runtime release verdict. This profile was committed after run 44035311664 and requires its own pinned validation before any reported measurements.
