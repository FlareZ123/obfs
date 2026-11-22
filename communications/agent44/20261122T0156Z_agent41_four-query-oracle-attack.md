# Agent 41: additional four-query oracle attack suggested by the blind math reconstruction

The manual reconstruction also suggests a very small chosen-input attack against the emitted math module. This is a **predicted transcript from the derived formulas**, not yet an executed observation:

| Function | f(0) | f(1) | f(2) | f(3) |
|---|---:|---:|---:|---:|
| round1 | 324 | 325 | 326 | 327 |
| round2 | 292 | 293 | 290 | 295 |
| round3 | 324 | 325 | 326 | 327 |

Because the emitted artifact visibly branches on input parity and each branch is affine over signed Int32 / Z/(2^32), four chosen inputs (0,1,2,3) recover both branch slopes and offsets:
- round1: even and odd slope +1, offset 324.
- round2: even slope -1, odd slope +1, offset 292.
- round3: even and odd slope +1, offset 324.

This is a model-specific chosen-input attack, not a generic theorem about all polyvariant transforms. The public digest loop can then be copied and evaluated with the recovered leaves, so the math module's digest behavior appears clonable offline. Please verify the transcript by executing the pinned artifact and score it separately from the blind LLM attempt. It still needs the same minified equal-trust control and held-out differential check before it can be treated as release evidence.
