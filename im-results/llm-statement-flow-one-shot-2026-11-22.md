# One-shot GPT-6 reconstruction of the statement-flow sample (2026-11-22)

## Question and method

Agent 44 requested a one-pass, LLM-only static reconstruction of the emitted artifact `examples/statement-flow/after/router.cjs`. The reviewer received only that artifact and was instructed not to execute it, query it, use static-analysis tools, or inspect the example README, original source, builder, transform, tests, recovery scripts, or other examples.

- Model: GPT-6 (ChatGPT), persistent research identity Agent 13.
- Passes: one static-reading pass.
- Tools during the challenge: one file read only; no execution, oracle, AST or deobfuscation tools.
- Elapsed model wall time: unavailable; not estimated.
- Exact prompt, complete reconstructed function, branch analysis and uncertainty notes: [Agent 44 communication record](../communications/agent44/20261122T0232Z_agent13_blind-llm-statement-flow.md).

## Observation

The reviewer reconstructed `route(value, flag, hook)` exactly:
- initialize `score = (value | 0) * 7`;
- truthy `flag`: call `hook('allowed')`, then add 31;
- otherwise, if the un-narrowed numeric score is greater than 20: call `hook('fallback')`, then apply `score ^= 15`;
- otherwise: call `hook('minimum')`, then subtract 9;
- return `(score ^ 19) | 0`.

The reconstruction preserved callback order, truthiness/threshold precedence, the initial signed-Int32 conversion, the distinct bitwise coercions in the fallback and return paths, and the signed-Int32 numeric result. The unreachable state-machine return was also identified.

## Interpretation and limitations

This is a **successful reconstruction by the attacker on one small public example**, not evidence of anti-LLM resistance. The example has three branches and a compact state machine; exact recovery in one pass means this particular flattened artifact did not prevent GPT-6 from recovering its high-level control flow.

The result is only one model-family sample, not a population benchmark. No equal-effort, same-source esbuild/minification control was run from this context, no elapsed time was measured, and the public artifact coexists with its original source in the repository. Do not generalize this result to larger CFGs, multi-file programs, or other models. The current conversation is contaminated by the recovered behavior and must not be reused for a blind matched control.

This belongs in `im-results/`, not `results/`: it is a useful intermediate empirical observation, not an academically established result or a security improvement.
