# Blind reconstruction result: polyvariant math artifact

**Sender:** Agent 41  
**Model:** GPT-6  
**Identity:** Agent 41 (same underlying model family as the other project reviewers; this is not an independent-model sample)  
**One pass:** Yes — one read of the specified emitted file, no source-side follow-up  
**Elapsed time:** Not instrumented  
**Execution/static tools:** None used. I read the emitted file only; no Node, Python, SymPy, runtime query, or static-recovery script was used.

## Exact prompt used

> This is a deliberately narrow anti-LLM red-team task, not a request to change compiler code.
>
> Analyze only the public distributed artifact:
>
> `examples/polyvariant-app/generated/math.mjs`
>
> Do not inspect `examples/polyvariant-app/native/`, the builder, any original-source examples, existing static-recovery scripts, tests, or reports that reveal the answer. Do not run the artifact, query it, use Node/Python/SymPy, or invoke any static deobfuscation tool. Treat this as a one-shot LLM-only static reading challenge with the source text as the sole input.
>
> Reconstruct `round1`, `round2`, and `round3` into the simplest exact equivalent JavaScript you can infer from the emitted source. State whether each is affine, piecewise affine, or something else; provide exact coefficients/modular semantics and any uncertainty. Do not claim success merely from a plausible explanation: provide a complete candidate replacement module or functions.
>
> Record the model/identity, exact prompt used, whether the result was obtained in one pass, elapsed wall time if available, and any ambiguities. If you cannot finish, report the partial result honestly.

## Reconstruction

All three functions first coerce the input to signed Int32. The switch tests the low bit. In either branch, the generated slot expression

`((x >> 1) << 1) | parity`

is exactly x, because the branch parity is the original low bit. Each branch is therefore an affine map over Z/(2^32), not a genuinely different input transformation.

The recovered functions are:

```js
export function round1(input) {
  return ((input | 0) + 324) | 0;
}

export function round2(input) {
  const x = input | 0;
  return ((x & 1) ? x : -x) + 292 | 0;
}

export function round3(input) {
  return ((input | 0) + 324) | 0;
}
```

Equivalent coefficient description, modulo 2^32:

| Function | Input parity | Slope | Offset |
|---|---|---:|---:|
| round1 | even | +1 | 324 |
| round1 | odd | +1 | 324 |
| round2 | even | -1 | 292 |
| round2 | odd | +1 | 292 |
| round3 | even | +1 | 324 |
| round3 | odd | +1 | 324 |

Thus round1 and round3 are globally affine translations. round2 is piecewise affine: it maps even x to -x+292 and odd x to x+292, with all arithmetic reduced modulo 2^32 and returned as signed Int32.

## Reasoning / uncertainty

The branch slopes follow from the first and last multipliers. Their products are respectively 1 or -1 modulo 2^32 because the large multipliers have the form 1±c·2^16, and the square term is divisible by 2^32. Collecting the signed additive constants in each branch gives 324 for round1 and round3, and 292 for both round2 branches.

I am confident in the reconstruction. I did not inspect the native source or invoke the hidden verifier, so this is a blind candidate rather than a verified result. The digest function is not claimed to be affine: it composes these leaves with character iteration, XOR, Math.imul, and a state-dependent right shift.
