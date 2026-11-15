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
