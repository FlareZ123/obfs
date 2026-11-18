# Compact polyvariant critical-path tradeoff (18 November 2026)

**Status:** intermediate, source-pinned compiler and independent attacker experiment. The candidate has no demonstrated security gain over conventional arithmetic minification. It is opt-in and is not eligible for a universal 2.5x claim.

## Experiment

The published `src/affine-native.js` polyvariant backend emits one randomized masked affine register per original arithmetic step. A selected-function-only real SNO workload independently established 17–31x CPU slowdown in `im-results/polyvariant-selected-hotpath-budget-veto-2026-11-18.md`.

The alternative compiler option `experimentalPolyvariantCompact:true` emits two algebraically exact, seeded addends under each independently selected case. The original source's signed-32-bit normalization occurs once, then each path returns an addition followed by a final `|0`. The input and constants remain within exact IEEE-754 integer range, so the output is identical modulo 2^32. Each case uses a different public offset and register spelling, but a source-only attacker can simply add its two constants to recover the original arithmetic mapping. The option is intended to evaluate a runtime/syntax tradeoff rather than claim new confidentiality.

Source `src/affine-native.js` and opt-in `src/core.js::obfuscateFiles` interface; experiment `sims/sno-resident-budget.js --compact`; attacker `sims/polyvariant-compact-static-recover.js`; corpus `test/polyvariant-compact-research.test.js`. The test compiles a real source module, verifies three changed functions/six variant paths, compares 8,000+ integer and Number-coercion inputs per function, validates Unicode digest outputs, and requires independent seedless static reconstruction on 4,096 fresh integer samples.

## Initial exact-source two-platform observation

At `04022487a906950212419674c8d73cac00b2f8d1`, [manual CI run 44210325406](https://github.com/FlareZ123/obfs/actions/runs/44210325406) **passed on Ubuntu and Windows** using Node.js 22.23.4. Both platforms passed strict JSDoc, the source-only static recovery test, the observable numeric/coercion differential, the SNO tamper and resident application tests, original selected-leaf hot measurements, new compact hot measurements and separately scoped original fresh-process startup profiles.

| Selected leaf chain calls per paired observation | Ubuntu original polyvariant / native CPU | Ubuntu compact / native CPU | Windows original polyvariant / native CPU | Windows compact / native CPU |
| ---: | ---: | ---: | ---: | ---: |
| 40,000,000 | 20.963x | **1.995x** | 22.194x | **2.000x** |
| 80,000,000 | 31.327x | **1.998x** | 29.255x | **1.984x** |

Each cell is the ratio of the protected and native **median process CPU durations** over 13 alternating-order paired observations after three warmups. A selected-function measurement includes `round1`, `round2`, and `round3` for each input-dependent recurrence iteration. Output SHA-256 and callback observations were identical for each native/protected request. The application-level comparison on identical SNO graphs had lower compact CPU overhead, approximately 1.01–1.06x on Ubuntu and 1.00–1.47x on Windows across 1/50/1000/10000-event workload groups.

**Strict-pair status:** all 52/52 original/polyvariant leaf observations exceeded 2.5x. **One of the 52 compact selected-leaf CPU pairs exceeded 2.5x**, in the Windows 40,000,000-iteration group, with observed maximum 2.51613x. Every compact group had a one-sided *median* decision `supported`, yet this strict observed pair is still a sample veto under the project's prescribed ceiling. The Windows CPU timing granularity can be large relative to individual short native durations. The event-10,000 full application in the unmodified backend also had one observed Windows CPU pair above 2.5x in this run. All these raw observations remain in the immutable workflow logs.

The substantially faster compact selected-leaf profile improves the measured runtime dimension. Its trivial symbolic source recovery leaves the **static reconstruction dimension unsupported as a security gain**. Its behavior under full-control Node instrumentation and public checksum replacement remains unprotected. The team should not promote this as a stronger obfuscator simply because it has lower sampled overhead.

## Next measurement

A longer-duration compact-only selected-function profile at source `d80c678271ee2c1467ffacb6d9da69a82cec4de0` has been dispatched to reduce Windows CPU quantum sensitivity. It uses 200 million and 400 million selected-function loop iterations per pair, leaving the previously validated full affine 40/80 million control unchanged. The latest result should be added only after the exact GitHub Actions run completes; the earlier 2.51613x strict sample must remain visible, regardless of later improvements.

This is a negative architectural-selection finding for high-security obfuscation, while also demonstrating an order-of-magnitude performance sensitivity to the lowerer's chosen arithmetic representation.
