# Byte-identical cold-process placebo: strict-ratio attribution under Node 22

**18 November 2026, Agent 8. Classification: intermediate performance-methodology evidence.** This experiment adds a same-byte, no-transform control to an existing property-renaming CPU gate. It quantifies whether a measured strict 2.5× ratio is necessarily attributable to the obfuscator. It does not demonstrate general compliance with the 2.5× requirement or greater security than an ordinary minifier.

## Frozen source, workload and method

Source-pinned branch `agent8/cold-placebo-20261118`, commit `1c10dc6f574f38d2158c6065d2a1b793870421be`, includes [the test](../sims/straightline-reader-cold-placebo.js) and its step in the manual [two-platform source-island workflow](../.github/workflows/manual-source-island-indirect-loader.yml).

The placebo writes the **same 174 source bytes** to two distinct, equal-length relative CJS paths (`native-a/entry.cjs` and `native-b/entry.cjs`). It verifies byte equality, starts an independent Node process for every sample, requires the same original module, loops for the selected call count, and checks equal executed-work digests. It uses precisely the child-runner source and the four call counts in the existing [native-versus-emitted strict gate](../sims/straightline-reader-cold-profile.js): **1, 10,000, 8,000,000, 128,000,000**. Each count has **nine counterbalanced A/B sample pairs**. The placebo deliberately reports individual breaches without throwing on them.

`process.cpuUsage()` measures the current process's user-plus-system CPU microseconds. The child converts that total to milliseconds after module load and business calls, so Node startup and JIT/setup are included while offline compilation is excluded. This is a fresh-process COO diagnostic, and its boundary is distinct from the preinitialized-hot-function study. The official [Node 22 process API](https://nodejs.org/download/release/v22.17.0/docs/api/process.html#processcpuusagepreviousvalue) documents the user/system units. All three CI repetitions used **Node v22.23.4** on the corresponding GitHub-hosted OS.

## Three immutable workflow repetitions

Every run executed the same commit, branch and workflow. Every Linux job passed. The Windows jobs for the second and third repetitions failed only in the later *native-versus-emitted strict CPU* assertion; their placebo step, actual semantics, real-browser work where applicable, and JSDoc checks completed successfully. Preserve these red candidate results.

| Workflow run | Ubuntu identical A/B >2.5× | Ubuntu original/emitted >2.5× | Windows identical A/B >2.5× | Windows original/emitted >2.5× | Workflow |
| --- | ---: | ---: | ---: | ---: | --- |
| [44356244298](https://github.com/FlareZ123/obfs/actions/runs/44356244298) | 0/36 | 0/36 | **2/36** | 0/36 | Green |
| [44356827322](https://github.com/FlareZ123/obfs/actions/runs/44356827322) | 0/36 | 0/36 | **1/36** | **1/36** | Red, strict Windows cold CPU |
| [44356818817](https://github.com/FlareZ123/obfs/actions/runs/44356818817) | 0/36 | 0/36 | **1/36** | **1/36** | Red, strict Windows cold CPU |
| **Observed total** | **0/108** | **0/108** | **4/108** | **2/108** | Three independent repetitions |

Windows identical-source placebo strict witnesses:

- First run, 1 call: first=15 ms, second=46 ms, yielding **3.06667×**. Its nine-pair ratio-of-medians was **1.00000×**.
- First run, 8 million calls: first=30 ms, second=93 ms, **3.10000×**. The ratio-of-medians was **0.75410×**.
- Second run, 1 call: first=30 ms, second=77 ms, **2.56667×**. The ratio-of-medians was **1.03333×**.
- Third run, 1 call: first=30 ms, second=77 ms, **2.56667×**. The ratio-of-medians was **1.32609×**.

The same frozen compiler actually rewrote **one own key** in the ordinary candidate gate. In the second Windows run the original/emitted 8-million-call maximum ratio was **2.56667×**; in the third it was **3.00000×**. All 128-million-call placebo and candidate pairs on both operating systems were below 2.5× in all three repetitions. The Windows 15–16 ms-looking CPU sample increments and variable process setup costs are visible in the raw CI `STRAIGHTLINE_READER_COLD_PLACEBO` and `STRAIGHTLINE_READER_COLD` JSON lines; their causal decomposition is not established.

## Interpretation and decision

**A strict >2.5× per-pair ratio occurred four times when the two executable modules were byte-identical.** Therefore a single sampled fresh-process ratio from this method cannot by itself identify obfuscation as the cause of the excess. The placebo uses identical code, so those exact four samples are not implementation slowdowns attributable to a transform. This is a direct reproducible measurement limitation, not an assumption about Windows timers.

The candidate's two strict Windows failures remain observed negative budget measurements. This experiment does **not** erase them, quantify the true candidate cost with high confidence, or certify 2.5× for all workloads. It also does not show anti-reconstruction or tamper resistance: a public-source normalizer already cloned this simple one-key transformation in the [separate equal-trust report](straightline-immutable-reader-proof-2026-11-18.md).

For future release decisions, retain every raw strict sample and report a same-code negative control beside the candidate's hot and whole-session measurements. When a noisy short-work threshold is exceeded, identify whether the measured mechanism is selected code, startup/JIT/loader overhead, or an unresolved mixture before asserting an obfuscator-caused regression. The 128-million-call row offers a longer workload with much smaller sampled scatter but is no substitute for the short-work constraint. The project-wide strong-protection release remains **blocked** independently of this attribution finding.
