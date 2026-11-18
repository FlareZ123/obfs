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

A second, longer-duration compact-only selected-function profile is independently pinned below. It tests 200 million and 400 million loops per observation to reduce Windows process-CPU quantization; the original hot control remains 40/80 million iterations. The earlier 2.51613x strict pair remains valid historical sampled evidence.

This is a negative architectural-selection finding for high-security obfuscation, while also demonstrating an order-of-magnitude performance sensitivity to the lowerer's chosen arithmetic representation.

## Longer-duration falsification, 18 November 2026 ~00:53 UTC

The independently [completed two-platform run 44210744630](https://github.com/FlareZ123/obfs/actions/runs/44210744630) at exact runner checkout `c9ba9eaa2100ad757f8545358133a529f61983dc` **passed both jobs**. The only concurrent intervening change from the benchmark source edit `d80c678271ee2c1467ffacb6d9da69a82cec4de0` was another agent's unrelated `.github/workflows/manual-sco-authorization.yml` edit. The compact generated math and resident runner are otherwise identical to the committed long-duration pilot. The workflow again passed strict JSDoc, native/obfuscated app digest parity, active SNO startup digest-tamper refusal, source-only compact recovery, and fresh-process SNO latency control.

| Selected leaf chain calls | Ubuntu compact median CPU ratio | Ubuntu strict >2.5x pairs | Windows compact median CPU ratio | Windows strict >2.5x pairs |
| ---: | ---: | ---: | ---: | ---: |
| 200,000,000 | **1.9999x** | 0/13 | **2.2936x** | 0/13 |
| 400,000,000 | **1.9944x** | **2/13** | **2.7594x** | **11/13** |

The maximum measured compact CPU ratio in the 400-million-iteration row was **3.3954x on Ubuntu** and **3.0000x on Windows**. The median native CPU duration for that row was **253.55 ms Ubuntu** and **187 ms Windows**, providing substantially more time resolution than the initial 40-million Windows native control (~31 ms). The sustained Windows compact median **exceeds the required 2.5x budget**, and **13/52 compact CPU pairs** in this run exceeded 2.5x. The still-present original full-affine baseline had **52/52 strict hot CPU pairs above 2.5x** across the shorter 40/80 million row pair. Full raw arrays are in the two CI job logs.

**Decision from the expanded evidence:** The compact variant mitigates much of the original backend's hot arithmetic slowdown but still violates the strict limit on realistic long selected-leaf workloads, including a **median-level Windows breach** with longer samples. Its independently demonstrated trivial public reconstruction prevents claiming a security improvement. **Reject both full and compact polyvariant candidates as general solutions to the primary objective.** They remain opt-in reproducible research variants, and the original tests of stateful application parity remain correct for their specific work fractions.

The difference between the 200-million and 400-million Windows ratios might involve JIT tiering, hidden GC effects, loop optimization or scheduler variation; the present data do not identify a mechanism. The independent native/obfuscated outputs were equal, so treating the higher ratio as a measurement artifact without further controlled evidence would be unjustified. A future candidate must pass matched long-duration hot CPU, complete application, and independent static/hostile-runtime attacks before selection.

## Compiler semantic fuzz, cross-platform (18 November 2026 ~00:57 UTC)

A focused [two-platform manual validation 44211601578](https://github.com/FlareZ123/obfs/actions/runs/44211601578), exact checkout `2284517acf58ab10f59f34ceae7b63c640e6d348`, **passed both Ubuntu and Windows**, including strict JSDoc, source-only three-function recovery, real module numeric/Unicode parity, and deterministic multi-grammar code-generation differential `sims/polyvariant-compact-fuzz.js 384`.

The corpus created **384** independent integer-normalized return-only JS source programs with 8–64 addition/subtraction steps, alternating ESM and CommonJS and cycling 2/4/8 public case variants. It transformed all **384** programs, selecting **1,792** total case paths, and checked **49,920** numbered native-versus-generated value/exception/coercion observations. Both operating systems reported the identical deterministic source+output corpus SHA-256:

`108fb0f7d3fe00bb8faaf23cdcdbf455efbb47aa5878d0c57f01c00a31544d50`.

No semantic mismatch was observed in that bounded corpus. These compatibility observations strengthen confidence in exact arithmetic behavior of this constrained compiler grammar; they do not improve source secrecy, prove arbitrary JavaScript compatibility, or cancel the 13/52 measured long-duration strict hot CPU breaches.
