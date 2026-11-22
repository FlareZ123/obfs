# LLM deobfuscation probes across three experimental backends

**Agent 44, 22 November 2026. Intermediate adversarial evidence only.**

## Executive finding

Two source-only, one-pass GPT-6 attempts on different public experimental backends show that the current polyvariant arithmetic and register-VM examples are readily interpretable by an LLM. The results are not uniformly exact: one attempt made a consequential sign-parity error in one of three arithmetic leaves, while another decoded the complete register tape correctly in 21.594 seconds.

These are qualitative probes, not a model benchmark. Both submitters self-reported that they did not inspect the original source or use execution/static tools. The source and emitted artifacts coexist in the public repository, so the no-source condition is based on compliance, not technical isolation. Both attempts identify GPT-6; they are not independent model families.

## Observed attempts

| Backend / artifact | Blind attempt | First-pass result | Time |
|---|---|---|---:|
| Polyvariant affine leaves — `examples/polyvariant-app/generated/math.mjs` | [Agent 41 transcript](../communications/agent44/20261122T0145Z_agent41_blind-math-reconstruction.md) | 2/3 exact; `round2` incorrectly reported as piecewise with an even-branch slope of -1 | Not measured |
| Register expression VM — `examples/expression-vm/after.cjs` | [Agent 42 transcript](../communications/agent44/20261122T015207Z_agent42_expression-vm-blind-reconstruction.md) | Exact expression and full six-instruction tape reconstruction | 21.594 s |

### Polyvariant arithmetic

The exact functions, validated against `examples/polyvariant-app/native/math.mjs`, are:

```js
function round1(input) {
  return ((input | 0) + 324) | 0;
}

function round2(input) {
  return ((input | 0) + 292) | 0;
}

function round3(input) {
  return ((input | 0) + 324) | 0;
}
```

Agent 41 correctly recovered the first and third leaves. Its second-leaf candidate fails at x=2 (290 instead of 294). The error came from considering the initial/final multiplier product but missing five intermediate unary negations in the even branch. Agent 44 sent the correction; Agent 41 preserved the original answer and recorded the correction in [a separate message](../communications/agent44/20261122T0158Z_agent41_blind-math-correction.md). The detailed scope and source validation are in [the leaf-specific report](llm-polyvariant-leaf-reconstruction-probe-2026-11-22.md).

### Register expression VM

Agent 42 reconstructed the exported function as:

```js
function mix(input) {
  return ((input + 7) * (input - 5)) ^ ((input + 3) & 255);
}
```

It decoded the opcode mapping, initial constants, six operations, and return register from the byte tape. Agent 44 subsequently compared this with `examples/expression-vm/before.cjs`; the expression is exact and preserves JavaScript operator/coercion order. The blind attempt reported one pass, no execution or static tools, and 21.594 seconds from artifact retrieval to completion.

## What this establishes—and what it does not

- The current register VM does not prevent a capable LLM from reading the public interpreter and decoding a short tape.
- The polyvariant affine leaves are algebraically simple enough for an LLM to identify, but exact sign composition can still be wrong on a one-pass attempt.
- A plausible LLM reconstruction is not an exact behavioral result until checked. In the arithmetic sample, a single input falsified the first-pass `round2` candidate.
- These examples do not establish resistance or lack of resistance for larger applications, `digest`, arbitrary source programs, browser dynamic extraction, or other models.
- The observed model family is GPT-6 only; no independent model-family replication has been recorded.
- No equal-trust esbuild/minification LLM control has yet been run. Therefore these probes do not measure any incremental attacker-cost advantage over ordinary minification.
- The existing hidden-source one-shot challenge framework in `sims/llm-blind-affine-challenge.js` remains the more appropriate route for future sealed trials; these public-artifact probes do not replace it.

## Decision

Do not treat VM encoding or polyvariant affine arithmetic as an LLM-resistance boundary. They may still contribute to static unreadability, but the present samples are not credible evidence of an advantage over an ordinary minifier. A future candidate should be compared against a same-source, same-model, same-prompt, equal-effort esbuild control and evaluated by exact held-out behavior. Until that comparison exists, the security claim remains **RELEASE-BLOCKED**.
