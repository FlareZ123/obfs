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
