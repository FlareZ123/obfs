# One-shot LLM reconstruction probe: polyvariant COO arithmetic leaves

**Agent 44, 22 November 2026. Intermediate adversarial evidence only.**

## Question and scope

Can a capable LLM reconstruct the exact arithmetic behavior of selected public COO helper functions from the emitted bytes alone, without consulting the original source, running the artifact, querying an oracle, or using a static recovery tool?

The tested artifact was `examples/polyvariant-app/generated/math.mjs`. The challenge covered only `round1`, `round2`, and `round3`. It did **not** cover the `digest` routine, the multi-file application, full held-out functional cloning, or any browser/runtime extraction.

## Blind attempt

Agent 41 submitted a one-pass static-reading answer in [its original transcript](../communications/agent44/20261122T0145Z_agent41_blind-math-reconstruction.md). It reported:

- Model: GPT-6.
- One pass, one read of the emitted artifact.
- No Node, Python, SymPy, execution, runtime queries, or static-recovery scripts.
- Elapsed time was not instrumented.
- The agent stated that it did not inspect native source or use the hidden verifier.

The attempt correctly identified that the generated slot expression reconstructs the original Int32 input and that each branch is affine over \(\mathbb Z/2^{32}\). It correctly recovered `round1` and `round3`, but its `round2` answer was **wrong**: it claimed an even-input slope of -1 and an odd-input slope of +1.

## Source validation and correction

After the blind answer was submitted, Agent 44 inspected the native source `examples/polyvariant-app/native/math.mjs` and checked the branch arithmetic. The exact functions are:

```js
export function round1(input) {
  return ((input | 0) + 324) | 0;
}

export function round2(input) {
  return ((input | 0) + 292) | 0;
}

export function round3(input) {
  return ((input | 0) + 324) | 0;
}
```

All three are global affine translations modulo \(2^{32}\), returned as signed Int32. In `round2`, the even branch's initial and final multiplier product is -1 modulo \(2^{32}\), but there are **five** intermediate unary negations, so its net slope is +1. The odd branch has multiplier product +1 and **six** unary negations, also yielding net slope +1. Both branch offsets are 292.

The original blind candidate fails at input `2`: it predicts 290, whereas the native function returns 294. The exact correction and counterexample were sent to Agent 41; Agent 41 accepted the error and preserved the original attempt as provenance in [its correction](../communications/agent44/20261122T0158Z_agent41_blind-math-correction.md). The original reviewer correction is also recorded in [Agent 44's message](../communications/agent41/20261122T0151Z_agent44_blind-math-round2-correction.md).

## Scoring

| Criterion | Observation |
| --- | --- |
| Exact leaf functions in first pass | **2 / 3** |
| Incorrect leaf in first pass | `round2` |
| Error type | Missed parity of intermediate unary negations while composing affine multipliers |
| Correct after reviewer feedback | 3 / 3 |
| Independent model family | No; the submitter identified GPT-6, the same underlying model family used by other project reviewers |
| Time-to-solve | Not measured |
| Held-out differential verification by the blind model | Not performed |
| Full digest/application reconstruction | Not attempted |

This is a bounded qualitative observation that the model can recognize the affine structure but can make a consequential arithmetic-composition error in a one-shot answer. It is **not** evidence that LLMs generally fail to deobfuscate this code, nor a statistically meaningful estimate of attack success.

## Interpretation

The sample does not demonstrate meaningful protection. The true functions collapse to three additions, and the repository already contains deterministic static recovery for the selected artifact. The LLM's first-pass error should not be confused with an attacker-cost advantage: a competent reviewer or a tiny modular-arithmetic script catches it immediately. Exact behavioral verification remains necessary even when an LLM gives a plausible simplification.

This probe is not a replacement for the existing hidden-source one-shot challenge framework in `sims/llm-blind-affine-challenge.js`. It is also not a model-independent benchmark: the original answer is self-reported, time was not measured, and the challenge artifact/source coexist in the public repository, so the no-source condition relies on the submitter's compliance. The result belongs in `im-results/`, not established academic `results/`.

## Reproduction pointers

- Emitted artifact: `examples/polyvariant-app/generated/math.mjs`
- Native source used only after the blind answer: `examples/polyvariant-app/native/math.mjs`
- Blind attempt: [Agent 41 transcript](../communications/agent44/20261122T0145Z_agent41_blind-math-reconstruction.md)
- Corrected submission: [Agent 41 correction](../communications/agent44/20261122T0158Z_agent41_blind-math-correction.md)
- Reviewer counterexample: [Agent 44 correction message](../communications/agent41/20261122T0151Z_agent44_blind-math-round2-correction.md)
- Existing deterministic static attacker: `sims/polyvariant-affine-static-recover.js`

The overall three-mode strong-protection decision remains **RELEASE-BLOCKED**.
