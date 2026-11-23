# Stateful three-file layered MBA CPU compared with ordinary minification and byte-identical placebo

**Agent 17, 23 November 2026. Classification:** intermediate experimental compute evidence for an opt-in arithmetic obfuscator; **not** release qualification, a verified universal bound, or a new defense. Strong-obfuscation release remains **RELEASE-BLOCKED**.

## Frozen workload, source, and trust

`test/bitwise-mba-stateful-cpu-profile.test.js` builds one literal three-module CommonJS application from the same source root. `math.cjs` contains two exported bit-slice-local Int32 functions, `engine.cjs` maintains mutable state and combines both outputs with input-dependent rotation/Int32 multiplication, and `runner.cjs` executes a deterministic 10,000,000-event loop after warming 1,000,000 separate events. Four independent Node child processes per paired repetition run **original, opt-in experimental layered MBA, same-source ordinary esbuild-minified**, and a **byte-identical original-code placebo** in the same relative file layout. All groups use exact same application data, engine, deterministic input sequences, Node 22 and repository revision, alternate group execution order per repetition, and emit the original application's final checksum. The entire selected session's process **user+system CPU** is measured after warm initialization. Seven fresh-process repetitions per arm per operating system; the experiment admits any strict over-2.5× sample as a failure, and reports each ratio instead of hiding maxima behind medians.

Node source-byte SHA-256 values in both Windows and Ubuntu logs:
- Original / placebo `math.cjs`: `1560b470de2dbd8b8b19a09689be942b824ed8e289aff64b0d7e0dbe4822ebdf`.
- Layered-MBA emitted `math.cjs`: `361d5783dac69fceb050b10f852da0c12e91aa5847c29742bb7bdc26d5a70e48`.
- Ordinary esbuild-minified `math.cjs`: `3dda712e7631a70713b460d0cb7d4c5bcb3ad2787daa5ad793f208e7adc89261`.

**Focused Ubuntu/Windows CI [45119957421](https://github.com/FlareZ123/obfs/actions/runs/45119957421) passed** all semantic/checksum checks and both strict JSDoc steps at immutable source `88076888b2d462ff076af5fa8b8d47579b3cf6a2`. The CPU profile itself is descriptive and never makes a false green 2.5× assertion.

## Raw paired process-CPU ratios

Seven ratios per arm (against that repetition's original/native process CPU), as logged from the completed CI job:

| OS and arm | Raw paired ratios | Median | Maximum | Observed strict >2.5× |
| --- | --- | ---: | ---: | ---: |
| Ubuntu, byte-identical placebo | 0.99064, 0.98819, 0.99378, 1.00301, 0.99248, 0.99828, 0.98731 | 0.99248× | 1.00301× | 0/7 |
| Ubuntu, layered MBA | 1.51756, 1.49506, 1.50483, 1.49770, 1.48151, 1.50046, 1.49959 | **1.49959×** | 1.51756× | 0/7 |
| Ubuntu, ordinary esbuild | 1.01846, 1.02128, 0.98139, 1.00329, 1.00038, 0.99933, 1.00525 | 1.00329× | 1.02128× | 0/7 |
| Windows, byte-identical placebo | 1.00000, 1.00000, 1.00000, 1.23810, 0.79487, 1.51613, 1.00000 | 1.00000× | 1.51613× | 0/7 |
| Windows, layered MBA | 1.50000, 1.51613, 1.41026, 1.49206, 1.00000, **2.51613**, 1.49206 | **1.49206×** | **2.51613×** | **1/7** |
| Windows, ordinary esbuild | 1.00000, 1.51613, 1.20513, 1.00000, 0.41026, 2.00000, 0.98413 | 1.00000× | 2.00000× | 0/7 |

The Windows candidate's **2.51613×** pair is a real **observed strict sample-budget veto** under the project's no-waiver rule, even though the seven-pair median is below 2.5 and all paired application outputs agree. No confidence statistic, median, warm-start amortization or cross-OS averaging may erase it. The observation itself does not identify compiler overhead as the sole cause: Windows process CPU timers are visibly coarser and the byte-identical placebo reached 1.51613× while ordinary minification reached 2.00000× without source-generation cost. At a shorter 1.2-million-event first attempt, Windows returned **0 CPU microseconds** for a ~11.3ms run and the test failed rather than fabricating a ratio; that discarded pilot is [CI 45119671125](https://github.com/FlareZ123/obfs/actions/runs/45119671125). The retained longer-loop data are still affected by Windows timer quantization and scheduling.

## Security-performance interpretation

For this frozen primitive and stateful graph, layered MBA has approximately **1.5× descriptive median hot CPU cost** on both operating systems, versus about 1.0× for the equal-source ordinary minifier. The same original layered functions are **offline functionally cloned in 8 authorized-looking calls** after publishing their math module; the identical eight-call attack clones the ordinary minifier, as shown by [the matched three-module adversary](bitwise-bit-slice-four-query-clone-2026-11-23.md). Thus the additional sampled compute cost has **no measured increment in black-box functional-cloning query complexity** for this specific bit-slice-local source family.

The measured work does not include startup and compilation (permitted to deduct for the SNO trusted server phase, **not** COO client setup), browser transport, remote SCO policy checks, other JavaScript functions, or an entire arbitrary application. Fresh processes mean the seven ratios are not literally all measurements in a single warm process, but distinct process IDs alone do not certify iid sample assumptions on a shared CI host. Finite zero-red sample lists on Ubuntu or minifier do not imply universal strict pass. The test is attached to an **experimental opt-in layered function transform**, not the shipping SNO/COO/SCO compiler, and cannot make a global release acceptance/rejection claim for those modes.

**Decision:** preserve the 1/7 Windows strict breach and conditional cost evidence; do not promote nested pointwise MBA as a stronger published candidate based on syntactic opacity, and require independently reproducible same-source equal-trust attacker cost, true application state/host parity, and universal strict-budget evidence for any future promotion.
