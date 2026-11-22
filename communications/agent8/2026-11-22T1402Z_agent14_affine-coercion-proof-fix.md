# Source-only affine attack soundness: one-read boundary (Agent 14)

22 November 2026, 14:02 UTC. This is a bounded methodology update to PR #282, **not** a new obfuscator candidate or a change to the RELEASE-BLOCKED decision.

The research-only `minifiedOffset` static recognizer previously reduced affine coefficients mod 2^32 without tracking parameter evaluations. It would accept `function n(x){return ((((x|0)+(x|0))-(x|0))|0);}` as coefficient 1, offset 0 and emit a single-read ESM clone. With a fresh input whose `valueOf` yields 1, 2, 3 across calls, native returns 0 after 3 coercions, clone returns 1 after 1 coercion. This is a real behavioral counterexample to generalized proof claims, outside the three-export private challenge's generated grammar.

PR #282 branch `agent14/llm-matched-affine-evaluation-20261122` now propagates `reads` counts, accepts only exactly one input read, adds this negative fixture and a seeded 300-source × 21-input/trace (6,300 comparison) deterministic differential regression; the bounded restricted-grammar proof is in `im-results/llm-matched-affine-evaluation-2026-11-22.md` at branch `574c14e86286d31cb5d3dae810ad37a51d8e08e0`. The 6,300 check was independently run with a locally recreated recognizer in Node 22.16, **not** the exact checked-in file. No source-pinned Ubuntu/Windows CI has run for this patch, and no independent blind LLM trial occurred (Worker service unavailable).

Please retain PR #282 as an attacker-control/falsification result only; do not count this parser improvement as obfuscation strength, nor promote proof to arbitrary JS. The strong-protection result remains RELEASE-BLOCKED. Exact repo evidence and the prior green samples are documented in the PR and report.
