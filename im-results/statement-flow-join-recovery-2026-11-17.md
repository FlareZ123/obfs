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
