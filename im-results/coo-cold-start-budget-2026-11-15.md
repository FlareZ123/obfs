# COO eager string decoding can exceed the 2.5× runtime budget (intermediate evidence)

Date: 2026-11-15  
Researcher: Agent 2  
Implementation: `src/strings.js` through `obfuscateFiles(...,{mode:'coo',properties:false})`  
Reproduction: `node sims/cold-start.js`  
CI: [manual cold-start run 43677098108](https://github.com/FlareZ123/obfs/actions/runs/43677098108)

## Experimental question

The target requires runtime overhead at or below 2.5× across workloads. COO initialization must count toward the budget, since the prompt permits amortized initialization deductions on the **server-side SCO/SNO** computations only. The current transformation eagerly decodes every protected UTF-16 string at script evaluation, even when the original code only assigns literal values.

Can the decoder, when executed on a fresh client, remain within 2.5× of equivalent original script initialization when the strings are large or numerous?

## Method and conditions

- Node.js v22.23.4 on GitHub Actions Ubuntu Linux x64 runner.
- Exact script source generated deterministically by `sims/cold-start.js`; SHA-256 hashes are printed for each scenario.
- Precompiled `vm.Script` for both source variants; compilation and parsing **excluded** from timed intervals. Each trial creates a new VM global realm and executes the script from cold state.
- Two independent measurement groups per variant, five warmups and eleven timed measurements in each group; alternate group order (original, transformed, transformed, original) to reduce ordering bias.
- Median of 22 timed executions per variant. Both execute to an identical observed `globalThis.payload`.
- Transformations use a fixed seed and disable property renaming to isolate the string encoder.
- These are noisy short-duration samples from one runner, and their absolute timings should not be treated as universal.

## Reproduced measurements

| Workload | Source bytes | Obfuscated bytes | Baseline median | Obfuscated median | Ratio |
|---|---:|---:|---:|---:|---:|
| One 4 KiB string literal | 4,118 | 12,733 | 0.451134 ms | 1.236639 ms | **2.7412×** |
| One 64 KiB string literal | 65,558 | 197,053 | 0.360069 ms | 11.018425 ms | **30.6009×** |
| 256 distinct 256-character strings | 65,832 | 201,319 | 0.358216 ms | 11.526425 ms | **32.1773×** |
| One short constant | 41 | 502 | 0.350394 ms | 0.383113 ms | 1.0934× |

The large-literal and many-literal observations are comfortably beyond 2.5×. These individual measurements falsify any claim that the current unconditional eager COO string-decoding implementation satisfies the runtime bound for all supported workloads. Source compilation would create additional costs and is excluded from these measurements.

The reproducible harness prints observed literal counts, source hashes, source sizes, raw timings, and pass/fail flags. A later run can compare different implementations or host architectures with the same workloads.

## Implication and direction

The current eager XOR decoding loop performs work proportional to the aggregate length of encoded strings before application logic. A one-time initializer is still startup work for COO. Larger strings increase initialization time substantially relative to a trivial assignment whose original initialization is fast.

Future candidate paths worth measuring include a selective string-eligibility policy with a configurable cold-start budget, lazy decoding of rarely accessed literals, precomputation under SCO/SNO server-side boundaries, and avoidance of the quadratic risks of string concatenation. A lazy strategy must be tested against hot-path repeated access and dynamic instrumentation. If a workload has too little original work to absorb even minimal transformation overhead, a strict 2.5× requirement may require declining expensive obfuscation entirely.

The benchmark addresses performance only. It does not establish resistance to static or runtime reconstruction. Eager decoder outputs are themselves present as normal JS strings after initialization and can be observed by a capable client adversary.

## Evidence standard

This is an intermediate empirical observation. Establishing a general performance theorem, robust confidence interval across runner architectures, or measured comparison of optimized decoder alternatives remains open. The result belongs in `im-results/`.

## Subsequent implementation change: optional eager COO strings

Later on 2026-11-15, `src/core.js` was changed so COO/SCO client files **skip eager string encoding by default**; callers must specify `strings:true` to opt in. The historical measured CI run 43677098108 was executed before that default changed, when eager decoding occurred automatically. The research harness `sims/cold-start.js` now explicitly passes `strings:true`, preserving direct comparability to the historical decoder behavior and avoiding accidental measurements of the no-op default.

This distinction matters for the project's claim: **the current default COO/SCO string policy avoids these specific eager-decoder costs by leaving literals unencoded**. The optional `strings:true` feature still requires a performance guard or warning for short-lived workloads. Encoding omission has its own static readability tradeoff. The SCO remote-method architecture can avoid distributing server-resident sensitive implementations; it remains outside this local string benchmark.

Do not cite the historical 30.6×/32.2× observations as measurements of the current default COO configuration without noting the version change.
