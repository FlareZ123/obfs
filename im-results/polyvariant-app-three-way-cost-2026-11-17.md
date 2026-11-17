# Three-way full-program cost of published COO vs source-only attacker reconstruction

**Agent 8, 2026-11-17. Status: intermediate empirical negative security evidence.** This is a frozen-application demonstration that an actual independent source-only attacker can reconstruct the selected polyvariant functions, execute an entire semantically equivalent application, and remove its measured transformation overhead. It does not generalize to arbitrary code obfuscators or prove any universal speedup.

## Exact program and three independent full ESM graphs

The source is the actual three-file stateful example under [polyvariant-app/native](../examples/polyvariant-app/native). The real compiler outputs the frozen distribution with the arithmetic math module transformed and the state/entry modules emitted unchanged. The public-source attacker [polyvariant-app-static-clone.js](../sims/polyvariant-app-static-clone.js) parses **only the shipped math module** and uses an independent AST arithmetic recovery algorithm to rebuild three native-form equivalents. The attacker does not know the seed, load the compiler, execute the protected functions for inversion, or consult original math source.

The new [three-way harness](../sims/polyvariant-app-three-way-budget.js) and [regression tests](../test/polyvariant-app-three-way-budget.test.js) independently import three materialized ESM module graphs into unique temporary directories for every session: original, compiled public, and rebuilt from public. File writes are completed before timing. Nine alternating execution-order trials compare each graph on identical input events, initial seed, JSON-visible state and reflection, and externally emitted callbacks. The timed boundary includes the entire module import and all application event processing. The three-way run shares a Node.js process but uses uncached file URLs; it does not measure isolated cold Node process launch or browser delivery.

Each ESM build is checked for complete output equality and exactly one external host emission per event. The simulator creates 1, 50, 1,000 and 10,000 events, including astral and BMP Unicode payloads. All three functions are genuinely exercised, as independently instrumented in [execution-coverage evidence](polyvariant-app-execution-coverage-2026-11-17.md). None of the timing figures comes from instrumented code.

The original graph has 2,467 UTF-8 bytes. The actual compiler distribution has 7,518 bytes, and the attacker's entire executable graph has 2,362 bytes. The math modules are respectively 832 / 5,883 / 727 bytes. The attacker reconstructs all 3 selected exported arithmetic functions from the distributed math, while copying the remaining original-public digest and state logic. The publication and reconstructed graph hashes are fixed and validated in the recorded workflow.

## Pinned cross-platform reproducibility

[Run 43999169543](https://github.com/FlareZ123/obfs/actions/runs/43999169543) at commit **d73aacd12ace153f65cb24574ffb158e262b11d9** passed the complete manual polyvariant matrix on **Ubuntu Linux and Windows, Node.js v22.23.4**. This includes unit tests, exact source compiler checks, independent AST reconstruction, browser arithmetic on real Chromium (Ubuntu), 2.5x baseline budgets, three-way nine-trial tests and a separate strict JSDoc build. The simulator emits raw chronological timings for each variant, an exact paired-median slowdown uncertainty diagnostic, and a SHA-256 graph fingerprint.

Each OS executed **4 workload sizes × 9 independent rounds × 3 full graph variants = 108 full application sessions**, with the three versions' complete outputs and callback counts matched in all 108. Combined, **216 complete sessions** matched; 3/3 selected functions were reconstructed.

| Events per full session | Ubuntu public/native medians | Ubuntu rebuilt/public medians | Windows public/native medians | Windows rebuilt/public medians |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.306x | **0.720x** | 1.244x | **0.811x** |
| 50 | 1.547x | **0.614x** | 1.276x | **0.768x** |
| 1,000 | 1.544x | **0.559x** | 1.639x | **0.592x** |
| 10,000 | 1.366x | **0.684x** | 1.402x | **0.684x** |

Reconstructed/native median ratios were 0.940x, 0.950x, 0.862x, 0.934x on Ubuntu and 1.009x, 0.980x, 0.970x, 0.959x on Windows. Small ratios below one reflect code and compilation differences together with runtime measurement variation; they cannot be treated as a general claim of attacker algorithm optimization.

The emitted distribution stayed within 2.5x for every observed ratio-of-medians and every **one-sided 98.046875%-coverage upper bound for the median of paired slowdown ratios** in these nine-trial samples; this is a property of these complete app workloads only. The paired bound assumes independent identically distributed timings; the shared process, garbage collection, JIT compilation and host scheduling can violate that assumption. It cannot establish per-call bounded slowdown or a guarantee across workloads.

An independent static math reconstruction produced one sampled algorithmic parsing time of **10.484 ms on Ubuntu and 14.830 ms on Windows**. The number is a single-process computer timing of a grammar-specific attacker, not a human effort measure, agent complexity measure, portable deobfuscation bound, or evidence for unrelated ciphers. The reconstructed ESM package is smaller than the original because the original math source contains intentionally redundant nested constant arithmetic that the attacker algebraically collapses.

## Real Chromium full ESM execution and steady-state paired CPU observation

The full original/public/attacker-rebuilt **three-graph browser ESM** check in [test/polyvariant-app-three-way-browser.js](../test/polyvariant-app-three-way-browser.js) now executes via actual localhost HTTP imports under headless Chromium. The browser first compares **complete JSON-visible outputs and emitted external host callback traces for all three graphs** at 1, 50, 1,000 and 10,000 stateful events. It independently fingerprints the baseline output and callback trace with WebCrypto SHA-256; Node computes the same output and trace hashes. It additionally verifies that ordinary HTTP access exposes the exact compiler-produced math module and that an absent graph path is not mistakenly served.

After functional equality, the page measures **nine alternating, already-loaded, warmed full-app synchronous sessions** of 10,000 events each, with identical callback work and a count check. [Green Ubuntu real Chromium plus Windows Node/JSDoc run 44000929908](https://github.com/FlareZ123/obfs/actions/runs/44000929908), exact SHA **0827aae56999d2ba329c7623e9a72a130a8984b8**, passed all checks:

| Browser metric, warmed 10,000-event full app | Original | Published obfuscation | Source-only attacker rebuild |
| --- | ---: | ---: | ---: |
| Median synchronous elapsed time, ms | 4.3 | 9.9 | 4.3 |
| Ratio of medians vs original | 1.000x | **2.302x** | 1.000x |
| One-sided paired-median upper vs original | reference | **2.302x** | 1.179x |
| Browser-authenticated public import / state / callback checks | original | pass | pass |

The attacker's reconstructed/native original ratio-of-medians was 1.000x, while reconstructed/published was **0.434x** in this specific runner profile; the latter's one-sided paired-median upper was 0.554x. Nine raw chronological browser trial triples and Node-calculated exact paired bounds are emitted in the CI log.

**Essential boundary:** This browser timing is a **warmed, already-imported synchronous application-work estimate**, so it excludes initial browser/module loading, HTTP fetch, parse/compile startup, and page launch. The exact statistical bound assumes iid, stationary observations; a shared browser process and jitter may violate those assumptions. One of nine measured published/native *individual* pairs exceeded 2.5x, despite the median-of-paired-ratios one-sided bound below 2.5x. The hard project-wide compute ceiling is therefore **not proven for arbitrary executions, cold starts or browser devices**. The real-browser result does independently confirm the stronger threat-model observation: publicly distributed executable source alone yields a full, directly importable, correctly behaving attacker replacement in an actual client runtime.

## Security-performance conclusion

On this frozen application, the protection is focused on three frequently invoked leaf functions, the rest of the 3-file program is publicly readable, and the attacker reconstructs an executable replacement for all three protected leaves. The published code is therefore heavier than both native and reconstructed variants at all tested event counts and still does not provide the claimed general static-clone resistance. This independent source-only attack needs no DevTools runtime secrets, privileged access, server endpoint or known compilation seed.

This is a **negative result for this specific two-path Int32 polyvariant affine grammar**. A harder, dissimilar transform could require different recovery machinery; no universal obfuscation impossibility theorem is implied by the finite benchmark. Conversely, the project's full-control COO threat model allows direct copying and execution of the original publication, independently of how hard source reconstruction might become. SNO file/runtime ownership and SCO server-private oracle capabilities are separate analyses.

Research selection should compare a proposed transformation to original/minified and *attacker-reconstructed* executable baselines, requiring independent attack evidence rather than treating extra bytes and CPU work as increased resistance. A candidate whose attacker reconstruction is smaller and faster should not be presented as a security-performance advance merely because its protected/native full-app ratio lies below 2.5x.

Related reports: [original source-only full executable rebuild](polyvariant-app-native-rebuild-2026-11-16.md), [dynamic hot-path coverage](polyvariant-app-execution-coverage-2026-11-17.md), and [exact paired slowdown inference](paired-runtime-budget-bounds-2026-11-17.md).
