# Hot selected-leaf CPU veto for SNO polyvariant arithmetic, 18 November 2026

**Status:** decisive measured negative candidate evidence for the tested source graph, not a universal JS bound and not a demonstrated attacker-cost benefit.

## Exact reproduced experiment

At `4463cd675728bf5d9cd7fdec73426091cba4a9a0`, the two-platform [manual source-pinned validation run 44208868147](https://github.com/FlareZ123/obfs/actions/runs/44208868147) **passed** its strict JSDoc, real graph-and-tamper tests and independent 13-pair repeated-work benchmarks. Ubuntu and Windows each used Node.js 22.23.4 and a real obfuscated SNO manifest launcher with one genuinely changed arithmetic module and three selected `round1`/`round2`/`round3` functions. The native counterpart executed the identical source-level operations without the selected transformation.

The worker loaded the complete multi-module stateful ESM application before returning READY. A separate `mode:'leaves'` request spent measured CPU time repeatedly applying those three actual exported arithmetic functions in an input-dependent integer recurrence, then compared native/protected output SHA-256. Every trial also preserved external-callback count (zero for this isolated path). Both workers ran in persistent Node processes to exclude permitted SNO startup, manifest, ESM import and IPC overhead. Each workload had three warmups per worker and 13 alternating-order pairs; process CPU and monotonic wall durations were reported separately.

## SNO genuine selected hot work

| Selected leaf call-chain iterations | Ubuntu median CPU ratio | Ubuntu highest paired CPU ratio | Windows median CPU ratio | Windows highest paired CPU ratio |
| ---: | ---: | ---: | ---: | ---: |
| 40,000,000 | **21.2530x** | 21.3045x | **17.6170x** | 27.2258x |
| 80,000,000 | **31.2448x** | 32.6721x | **21.2308x** | 21.6410x |

**Strict veto:** **52/52 paired CPU samples exceed the 2.5x limit**, at these two work counts on two OSes. All real output hashes and callback counts were equal. The hot arithmetic is the actual opt-in `experimentalPolyvariantAffine` with `experimentalPolyvariantCount:2` and its current published mask-per-original-step body; source hashes and raw samples are in the immutable job logs.

The existing four whole-application workloads in the **same source and CI jobs** each showed **0** strict CPU breaches, with sampled CPU median ratios Ubuntu approximately 1.135/1.310/1.434/1.447 and Windows approximately 1.205/1.147/1.397/1.660. Full app callbacks, stateful JSON and reflection dilute the overhead of selected functions in this fixture. Therefore whole-application budget support cannot be used as a stand-in for arbitrary protected hot-call workloads. This is a concrete counterexample to claiming broad 2.5x compliance from the earlier stateful application profile.

## Security implications and next experiment

The slow backend is independently statically recoverable under the project's public-only AST attacker, and the attacker can instrument its Node runtime. The 17-31x hot slowdown has no measured security compensation in the declared attacker model. **Reject this candidate for arithmetic-dominant deployments under the given 2.5x ceiling.**

A separate opt-in compiler experiment, `experimentalPolyvariantCompact:true`, is being tested to reduce the hot path from a series of per-source-step affine registers to two exact addends per public case. These addends are trivially recoverable from the published AST and must not be credited as better security. Any runtime benefit needs native differential parity and paired Linux/Windows CPU validation, with exact source pins distinct from this already verified negative result.

This intermediate result should inform architecture selection immediately. Any future release claim needs workloads that concentrate execution inside selected functions, both in isolation and in integrated application context.
