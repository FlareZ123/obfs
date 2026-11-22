# Agent 13: blind LLM reconstruction of statement-flow router

**Date:** 2026-11-22 UTC  
**Model / identity:** GPT-6 (ChatGPT), operating as persistent repository identity Agent 13  
**Artifact read:** `examples/statement-flow/after/router.cjs` only  
**Method:** one-pass static reading of the emitted artifact. No execution, oracle queries, AST tooling, source maps, deobfuscator, builder, original source, tests, README, or other examples were consulted for the reconstruction.  
**Elapsed wall time:** not available; no reliable per-task model wall-clock timer was exposed, so no estimate is reported.

## Exact prompt

> Use only the emitted file `examples/statement-flow/after/router.cjs`. Do not inspect its README, `before/` source, builder, source transform, tests, static-recovery scripts, or other examples. Do not execute it, query it, or use static-analysis tools. Treat the task as one-shot LLM-only static reading.
>
> Reconstruct the original high-level `route(value, flag, hook)` control flow and exact behavior. Include the order and conditions of all `hook` calls, return value and 32-bit coercions. Supply a complete equivalent function. Record model/identity, exact prompt, one-pass status, elapsed wall time if available, and uncertainties.

## Reconstructed equivalent

```js
'use strict';

function route(value, flag, hook) {
  var score = (value | 0) * 7;

  if (flag) {
    hook('allowed');
    score += 31;
  } else if (score > 20) {
    hook('fallback');
    score ^= 15;
  } else {
    hook('minimum');
    score -= 9;
  }

  return (score ^ 19) | 0;
}

module.exports = { route };
```

## Control-flow and behavior

1. **Initialization happens first:** `value | 0` applies JavaScript's signed 32-bit `ToInt32` conversion. The resulting signed integer is multiplied by 7 and stored as a Number in `score`. Multiplication itself is ordinary Number multiplication; it does **not** wrap to 32 bits.
2. **Truthy `flag` takes precedence:** call `hook('allowed')`, then add 31 to `score`. The score threshold is not examined on this path.
3. **Falsy `flag`:** compare the un-narrowed numeric `score` with 20.
   - If `score > 20`, call `hook('fallback')`, then perform `score ^= 15`. This compound bitwise assignment converts the current score to signed Int32 before XOR and stores the signed 32-bit result.
   - Otherwise, call `hook('minimum')`, then subtract 9 from `score`. This subtraction is ordinary Number arithmetic; it does not itself narrow to 32 bits.
4. **Return:** evaluate `(score ^ 19) | 0`. XOR performs signed-32-bit coercion and produces an Int32 result; the final `| 0` is redundant for the numeric value but preserves the explicit signed-Int32 result. A normally completing call therefore returns a signed 32-bit Number.

Exactly one hook call occurs on every normal completion:
- truthy `flag` → `'allowed'`;
- falsy `flag` and initial `score > 20` → `'fallback'`;
- falsy `flag` and initial `score <= 20` → `'minimum'`.

Because the initial score is (7 \times x), where (x = \operatorname{ToInt32}(value)), the fallback condition is equivalently (x \ge 3) when `flag` is falsy.

The hook's return value is ignored. Its call occurs before that branch's score adjustment; if it throws, the adjustment and return are not reached. If the selected hook value is not callable, the call throws. The file is in strict mode, so this is a plain `hook(...)` call (an ordinary unbound function observes `this === undefined`).

The input conversion may itself have observable behavior: for example, an object can run `Symbol.toPrimitive` / `valueOf` during `value | 0`, and a Symbol or a BigInt mixed with the Number literal `0` throws. `NaN`, infinities, and signed zero convert to zero under `ToInt32`. The conversion occurs before any hook call.

The state-machine case `1322170801` returns `undefined`, but no transition from the initial state or any reachable state assigns that value; it is unreachable in ordinary execution. The invalid-state default is likewise unreachable through the visible transitions.

## Uncertainties and scope

No control-flow uncertainty remains from the emitted artifact: the initial state and every reachable transition lead to exactly one of the three hook branches and then the common integer return. The unreachable return/default cases are noted above. This is a one-sample qualitative reconstruction, not a population-level anti-LLM benchmark, not a measured model-attack cost comparison, and not evidence about resistance relative to an equal-trust minified control.
