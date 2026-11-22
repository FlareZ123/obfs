# JsDeObsBench external adversary evaluation bridge (2026-11-15)

Status: evaluation infrastructure, with **no LLM-attack score claimed**.

## Primary sources

- Guoqiang Chen, Xin Jin, and Zhiqiang Lin, *JsDeObsBench: Measuring and Benchmarking LLMs for JavaScript Deobfuscation*, ACM CCS 2025, DOI 10.1145/3719027.3744871, https://arxiv.org/abs/2506.20170
- Public implementation, dataset-format example and Docker evaluators: https://github.com/Ch3nYe/JsDeObsBench
- Benchmark leaderboard and scoring description: https://jsdeobf.github.io/

The paper distinguishes syntax validity, execution correctness, code simplification, and source similarity. These are four separate observations. A valid deobfuscated program can remain difficult to understand. A readable answer can also be semantically wrong.

## Reproducible adapter

The local sims/jsdeobsbench-adapter.js consumes upstream JSONL rows with filename, original, and test_cases. It generates obfuscated source through this project's public COO or SNO compiler, preserving the original program and all test cases. The outputs retain the upstream schema so they can be passed to JsDeObsBench's model runner and Docker evaluator. They add a mode marker, native-source and obfuscated-source SHA-256 fingerprints, and compiler transformation counters.

Example on Windows PowerShell, from the obfs repository directory:

    node sims/jsdeobsbench-adapter.js --input C:\Bench\Project_CodeNet_selected.jsonl --output C:\Bench\obfs-coo.jsonl --mode coo --seed pinned-v1 --max 200

    node sims/jsdeobsbench-adapter.js --input C:\Bench\Project_CodeNet_selected.jsonl --output C:\Bench\obfs-sno.jsonl --mode sno --seed pinned-v1 --max 200

Use the upstream repo's documented deobfuscators/query_vllm.py and eval.py to produce evaluated, model-specific deobfuscated JSONL. Each model run should record an exact model revision, prompt template, in-context examples, decoding parameters, maximum tokens, total completions, failures and costs. Then publish raw inputs and candidate outputs, with any private keys or user-submitted source excluded.

The adapter intentionally does not execute third-party programs. The upstream project's Docker evaluator handles syntax and behavior. Do not run untrusted benchmark programs directly in an unsandboxed production environment. Source text in CodeNet-style fixtures may rely on stdin and stdout; preserving the original test case bytes is important.

## Interpretation and limitations

This benchmark measures source-visible attacks against publicly distributed COO and SNO. SNO owner attack access includes the runtime and full filesystem. A source-only benchmark is a subset of that capability. SCO server-private methods cannot be represented honestly by a single public-source deobfuscation file; they need a separate online oracle and authentication experiment.

Do not treat any LLM model score as resistance to source-only automation, DevTools instrumentation, runtime extraction, a normal bundler, or arbitrary behavioral cloning. Existing independent offline normalizer attacks already reconstructed some candidate output without any LLM. Against selected programs, upstream differential tests should also include normal native execution and hot/cold timing within the 2.5x budget. The JsDeObsBench four metrics alone do not test that budget.

### Minimum scientific reporting for a future experiment

Publish the compiler and benchmark Git SHAs, input sample IDs and any exclusions, deterministic seed policy, transformation coverage, runnable evaluator version, model configuration, the four metric distributions, per-case failures and confidence bounds. Compare to a public non-LLM deobfuscator and a no-obfuscation baseline under the same visibility. Treat a model output that simply replays an equivalent obfuscated program as an executable clone, while separately measuring whether it genuinely simplifies or reconstructs the logic.

This infrastructure is not an established improvement to security. It belongs in im-results/ until a pinned, independently repeated adversarial run exists.

## Audited external corpus, pinned upstream

The published name-obfuscation JSONL at upstream Git commit
8b2e1c35dc4ae25a46ea580ea5dcb6b5de5edbe9
and Git blob SHA 4bde98f958eb81b070f411f39545ea6d5339e8d8
was inspected directly without executing the third-party source. It contains
**1,301** valid unique programs with a reference original and test_cases.
The original-source size has median 512 UTF-16 code units, 95th percentile
947 and maximum 999. The published already-obfuscated size has median 750
and maximum 2,258. The per-program reference suite has median 2 and maximum 6
test cases.

A lexical audit found **1,211 / 1,301 (93.08%)** original programs containing
the literal /dev/stdin, **1,249 / 1,301 (96.00%)** containing a direct require(
call, and **168 / 1,301 (12.91%)** containing non-ASCII source text. These are
lexical counts, not dataflow proofs. The source-usage ratio underscores that
the upstream dataset is Linux/Docker-oriented. The original test program may
fail on ordinary Windows Node.js before any obfuscation is applied, so
Windows native failures of these fixtures must not be blamed on the compiler.
The repository's own smoke fixtures use file descriptor zero for cross-platform
validation.

The helper sims/jsdeobsbench-audit.js recomputes the corpus statistics from
a local copy of this exact JSONL, with no code execution. The audit and adapter
tests use synthetic data and therefore do not constitute a full benchmark
execution or validation of every external test case.

A future evaluation must record separately (1) input baseline correctness in
the chosen Linux container, (2) transformed correctness with identical
inputs and environment, (3) independent attacker reconstruction scores and
(4) cold-start, hot-path and end-to-end overhead. Only cases with a working
native baseline are eligible for a comparative failure rate.

## Verified 1,301-program full-corpus differential result

Pinned [manual external CI run 43703432496](https://github.com/FlareZ123/obfs/actions/runs/43703432496) at obfs commit 20eeb56e8da64877dd3d1a6f9deb5a7fe6c51d7e executed the complete verified name-obfuscation source corpus in the Linux node:22-alpine image. The workflow had an explicit SHA-1 Git-object check for the pinned external JSONL. The generated public-source COO and SNO sets each contained all 1,301 programs. Each mode's test selected **up to 2** official input/output cases per program, 2,200 reference cases total, in deterministic hashed order.

| Outcome | COO | SNO |
| --- | ---: | ---: |
| Input programs | 1,301 | 1,301 |
| Official candidate cases attempted | 2,200 | 2,200 |
| Baseline original executions succeeding | 2,199 | 2,199 |
| Baseline expected-output disagreements | 0 | 0 |
| Matched original vs obfuscated stdout/stderr and status | **2,199** | **2,199** |
| Obfuscated execution errors | 0 | 0 |
| Obfuscated output mismatches | 0 | 0 |
| Baseline-invalid reference cases excluded | 1 | 1 |
| Median whole-process elapsed ratio, conditional on matched cases | 0.9990880766x | 0.9997033821x |

The single original-program failure is official fixture p02618_1, test index 0: its original source evaluates main(input) with undeclared input, producing ReferenceError before any transformation. It was excluded from the paired verdict. All remaining reference outputs matched the provided expected text after trim. Raw differential failure witnesses (limited to ten) and all counts are visible in the CI job logs. The measured ratios include Node process startup and spawn overhead, and are not standalone hot-loop ratios or proof of the 2.5x requirement on every program.

Important limitation: the differential evaluator reports native equivalence over at most two official test cases per source file. It does not prove semantic equivalence over other input branches, external API contracts, reflection, or arbitrary runtime modification. This experiment is not evidence of program secrecy against automated reverse engineering or LLMs; it is a compatibility gate for future attack experiments.

### Critical harness repair retained as negative evidence

Earlier pinned manual runs 43702918423 (source 18b48aa) and 43703061283 (source b646e89) initially found 89/94 baseline original executions failing on the 50-program subset while five paired cases matched. The follow-up run captured the exact Linux error ENXIO reopening /dev/stdin from subprocess stdin. This was a harness artifact because a pipe descriptor is not reliably reopenable through /proc/self/fd/0. The evaluator now writes each reference input through the project's atomic locked writer into a container-private 32-MB tmpfs file and attaches that regular file as the child process's read-only stdin. The container remains network-disabled, read-only outside the bounded tmpfs, nonroot, CPU/memory/pids-limited. The corrected 50-program run 43703293828 proved 94/94 eligible and 94/94 matches for both COO and SNO before the full 1,301-program run.

The full manual Node 22 Ubuntu/Windows validation run 43703443619 at the same source SHA 20eeb56 passed the standard test, JSDoc, benchmark and Ubuntu browser integration gates. These results are pinned; later edits to coverage reporting are not implicitly certified.

## Transformation coverage, tails and explicit CommonJS grammar (validated 2026-11-15)

[Manual three-lane workflow run 43704598450](https://github.com/FlareZ123/obfs/actions/runs/43704598450) at obfs commit 816e064ca5f085101ca73a759f3a67cd415a879c evaluated the pinned 1,301-source corpus in independent COO script, SNO script and SNO CommonJS modes. Each processed all 1,301 programs and preserved all 2,199 eligible input/output cases. The third lane explicitly requests source-type commonjs and executes both original and transformed program files through the Node.js CommonJS file module wrapper. The single reference-original failure remains p02618_1, with input undefined.

All source columns total 719,005 UTF-8 bytes; output size and transformations:

| Measure | COO script | SNO script | SNO CommonJS |
| --- | ---: | ---: | ---: |
| Obfuscated UTF-8 bytes | 824,951 | 1,319,459 | 1,325,986 |
| Aggregate output/source size | 1.147351x | 1.835118x | 1.844196x |
| Programs with identifier-binding renames | 830 | 830 | 842 |
| Total renamed identifier bindings | 2,929 | 2,929 | 3,118 |
| Programs with encoded literals | 0 | 1,039 | 1,039 |
| Total encoded string literals | 0 | 2,304 | 2,304 |
| Programs with proven private-property changes | 0 | 0 | 0 |
| Total changed private-property keys | 0 | 0 | 0 |
| Matched native eligible cases | 2,199 / 2,199 | 2,199 / 2,199 | 2,199 / 2,199 |

In the prior bounded full corpus run with per-process tail telemetry [43703960540](https://github.com/FlareZ123/obfs/actions/runs/43703960540), the COO script conditional process ratio had median 0.99536x, p95 1.10849x, maximum 1.33414x; SNO script had median 1.00097x, p95 1.08797x, maximum 1.30282x. No eligible process-pair ratio exceeded 2.5x in that run. The three-lane CommonJS file execution had median 1.00016x, p95 1.07511x, maximum 1.44164x. These include process startup and do not establish the hot-path budget or any worst-case generalization.

**Interpretation:** classic-script mode deliberately does not rename local properties because globals can escape through other script files. The explicit CommonJS lane activates the proof pass, but this specific algorithmic CodeNet corpus still produced zero proven safe private-property changes. A separate synthetic CommonJS regression fixture positively demonstrates the pass working on an object with a literal key. Source inspection of the 1,301 originals using rough lexical patterns found just nine const-object literals and three files with a const-object variable followed by a direct dot-property read. That count is a syntactic estimate and cannot establish property-ownership safety. Thus this dataset is strong for independent behavior preservation but weak evidence about the cross-file/interprocedural property-renaming requirement. Use the repository's dedicated multi-file provenance/dynamic-reflection suites for that requirement.

The strict TypeScript/JSDoc check of external research scripts is now separately available with jsconfig.external.json and npm run typecheck:external. It should remain part of the manual validation gate. Any benchmark report must disclose the exact sourceType and execution style to prevent comparing script and CommonJS under mismatched module semantics.

### Official case coverage denominator

The pinned upstream 1,301-program JSONL has **2,984 total official input/output cases** (402 programs have 1 case, 284 have 2, 478 have 3, 108 have 4, 26 have 5, and 3 have 6). The current bounded validation executes the first two per program, **2,200 / 2,984 official cases** (73.73% of the published case count), leaving 784 additional published inputs for a higher-coverage follow-up. The original baseline excluded one failing case, so the 2,199/2,199 transformed match rate applies to the **eligible first-two subset**, and must not be stated as covering all 2,984 cases.

### Nondeterministic source detected in repeated full-corpus run

[Manual three-lane run 43705839659](https://github.com/FlareZ123/obfs/actions/runs/43705839659) found one true **pairwise run mismatch** in COO script, p02385_1 case 0, where the official original printed No and transformed printed Yes. Inspection of the exact pinned original reveals repeated calls to Math.random() inside a 100-iteration randomized dice search, with a conditional early break. The original independently disagreed with its official reference output in this run. Since the two scripts were launched as separate processes without a shared random seed, this result is a random-path confounder and **cannot establish a compiler semantic regression**. It is also incorrect to erase or silently reinterpret the failed run.

The harness has since been updated to derive a positive 31-bit per-file/per-case seed from SHA-256 of the pinned experiment seed, filename and case index. Both independent Node processes receive the same V8 --random-seed option before source execution. This changes the evaluation environment equally for original and transformed source, avoiding global monkeypatches and making Math.random() reproducible across the pair. Strict independent source/output SHA-256 checks remain required. New synthetic tests assert fixed-seed repeatability and seed differentiation.

The rerun should re-establish the paired error counts. Other nondeterminism sources such as time, concurrent external state, OS scheduling and cryptographic entropy remain outside this one-control guarantee. A single matching seeded trajectory does not prove equivalence over every possible random stream.


## Full official-case follow-up (2026-11-22)

The earlier sections above document the historical 2,200-case subset and its 2,199 eligible baseline executions. The existing manual-only workflow was expanded from `--cases 2` to `--cases 6` (the pinned corpus maximum) without adding a new workflow. [Run 44976974874](https://github.com/FlareZ123/obfs/actions/runs/44976974874) completed successfully at source commit `bbf8aa29057f62ab706ecf7e17f009166eadd3b2`. It verified the same upstream JSONL Git blob and exercised all **2,984/2,984 official cases** across all **1,301/1,301 programs** in each lane.

### Differential results

| Lane / comparison | Cases attempted | Baseline pass | Baseline failure | Transformed matches | Mismatches | Errors | Median process ratio | P95 process ratio | Maximum process ratio |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| COO script: native vs compiled | 2,984 | 2,983 | 1 | 2,983 | 0 | 0 | 0.99787x | 1.03159x | 1.35127x |
| SNO script: native vs recovered public code | 2,984 | 2,983 | 1 | 2,983 | 0 | 0 | 0.99750x | 1.03586x | 1.69782x |
| SNO script: native vs compiled | 2,984 | 2,983 | 1 | 2,983 | 0 | 0 | 0.99760x | 1.08410x | 1.25603x |
| SNO CommonJS: native vs recovered public code | 2,984 | 2,983 | 1 | 2,983 | 0 | 0 | 1.00015x | 1.03478x | 1.44575x |
| SNO CommonJS: native vs compiled | 2,984 | 2,983 | 1 | 2,983 | 0 | 0 | 0.99950x | 1.03325x | 1.31908x |

All five comparisons reported zero baseline/official disagreements, zero transformed mismatches, zero transformed errors, and zero samples over the 2.5x *process-level* threshold. The one excluded baseline failure is unchanged in every lane: `p02618_1`, case 0, fails in the original program with `ReferenceError: input is not defined`. It is not a transformation failure.

**Timing limitation:** every ratio above measures the whole Node process, including process spawn and V8 startup. It is not a repeated hot-path compute measurement and cannot establish the prompt's 2.5x runtime budget.

### Current transform coverage at the tested compiler revision

| Measure | COO script | SNO script | SNO CommonJS |
| --- | ---: | ---: | ---: |
| Source UTF-8 bytes | 719,005 | 719,005 | 719,005 |
| Output UTF-8 bytes | 722,612 | 750,117 | 750,117 |
| Aggregate output/source ratio | 1.00502x | 1.04327x | 1.04327x |
| Programs with binding rewrites | 53 | 53 | 53 |
| Total binding rewrites | 135 | 135 | 135 |
| Programs with private-property rewrites | 0 | 0 | 0 |
| Private-property rewrites | 0 | 0 | 0 |
| Programs with encoded string literals | 0 | 59 | 59 |
| Encoded string literals | 0 | 134 | 134 |

The pinned corpus audit still reports 1,301 valid unique programs, 2,984 cases (minimum 1, median 2, maximum 6), 1,211 stdin-oriented rows, 1,249 rows containing Node `require`, 168 non-ASCII sources, and 50 possible source observers. The corpus remains a single-file, algorithm-heavy compatibility population; it provides no positive evidence for private-property renaming because every lane records zero property rewrites.

### Public-only SNO string-recovery result

The isolated attacker received only the published source rows, public attacker code, its generic atomic-file helper, and Acorn's standalone parser files. The original programs, official test cases, compiler metrics, and compiler seed were not mounted in the attacker container. In both SNO grammars, the static source-only attacker recovered **134/134** compiler-reported encoded literal references across 59 programs, with zero unrecognized tables and zero incomplete references:

| SNO grammar | Programs | Encoded tables | Encoded literals | Recovered literals | Static decode wall time | Per-program median | Per-program P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Script | 1,301 | 59 | 134 | 134 | 366.40 ms | 0.146 ms | 0.644 ms |
| CommonJS | 1,301 | 59 | 134 | 134 | 456.54 ms | 0.211 ms | 0.910 ms |

The recovered code then matched the native program on all 2,983 baseline-eligible official cases in both grammars. This is a bounded negative result for the current public XOR string encoder, not a general deobfuscation theorem.

### Yield change versus the historical run

The historical three-lane run `43704598450` at compiler commit `816e064ca5f085101ca73a759f3a67cd415a879c` reported 830/1,301 programs and 2,929 binding rewrites in COO and SNO script, and 842 programs / 3,118 rewrites in SNO CommonJS. The current revision reports 53 programs / 135 rewrites in every lane. This is a substantial cross-revision yield reduction, not a controlled ablation. The AST source-observer analysis and source-spelled-error operand guards have expanded since the historical run; their individual causal contribution has not been isolated. Agent13 requested review from the recent source-observer and identifier-guard contributors in `communications/agent7/` and `communications/agent8/`. Do not describe the change as a regression or intentional safety win until that comparison is reproduced and explained.

## Interpretation

The full official-case run materially strengthens compatibility coverage from 73.73% to 100% of the pinned published case set. It does not increase the corpus's value for multi-file property analysis, and it does not change the security conclusion: current string-table encoding is statically recoverable, property-renaming yield on this corpus is zero, and the process-level timing is not a hot-path budget proof.


## Identifier-yield refusal diagnosis (2026-11-22)

A diagnostic-only run, [44978868080](https://github.com/FlareZ123/obfs/actions/runs/44978868080), pinned to commit `f0237ca60982efc6379d2e54e46b007962798899`, reran the adapter and source-observer analysis in all three modes without repeating the Docker differential. All modes produced identical counts and zero parser failures:

| Diagnostic | Files |
| --- | ---: |
| Function-source observer | 268 |
| Distributed-source observer | 1,215 |
| Both observers | 243 |
| Neither observer | 61 |
| Union of observer flags | 1,240 |
| Observer-flagged files with binding rewrites | 0 |
| Observer-flagged files without binding rewrites | 1,240 |
| Neither-observed files with binding rewrites | 53 |
| Neither-observed files without binding rewrites | 8 |

The reason classifier found `file-module-require` in exactly 1,215 files and `native-reflection-access` in 18 files. The 18 reflection cases overlap the file-module bucket; the distributed-observer count is exactly the static file-module-require count. No parser failures occurred. The upstream audit records 1,211 stdin-oriented programs and 1,249 Node-`require` programs, so the file-module trigger is close to the corpus's stdin-reader population.

### Why this matters

In current `src/core.js`, `observesDistributedSource` contributes to the whole-program `remoteSourceObserver` gate, which prevents the identifier pass from running. Separately, `renameLocalIdentifiers` refuses the file when `observesFunctionSource` is true. The diagnostic therefore attributes the 1,240 no-binding files to the union of those two observer gates: 1,215 distributed-source files plus 25 function-source-only files. The remaining eight files have neither observer flag but still receive no binding rewrites; their candidate/reference proof reasons have not yet been isolated.

The distributed-source reason classifier reports that all 1,215 flagged files statically require a file module (`fs`, `fs/promises`, or the `node:` equivalents). A regression-style diagnostic fixture confirms that the current detector flags this source even when the only visible read is `fs.readFileSync('/dev/stdin','utf8')`. This demonstrates that the current gate is capability-based at module-import time, rather than requiring a source-read operation or source-path provenance. It is a concrete coarse-trigger example, not proof that every file-module import in the corpus is harmless: an imported filesystem module can also read the executing source through other calls or paths.

A path-sensitive refinement could preserve fail-closed behavior for `__filename`, `__dirname`, and unknown paths while permitting transformations when the only proven read target is stdin or another unrelated input. Whether that is sound under all deployment layouts remains an open question for the Node source-observer owners. Agents 7, 8 and 50 were asked to review the exact gate, the per-callable function-source veto, and a possible path-provenance analysis.

The reusable diagnostic is `sims/jsdeobsbench-yield-diagnostics.js`; its regression-style tests are in `test/jsdeobsbench-yield-diagnostics.test.js`. The existing manual workflow now accepts `diagnostics_only=true` to regenerate the corpus, coverage and refusal diagnostics without repeating the expensive Docker differential. The default manual invocation still performs the full differential.
