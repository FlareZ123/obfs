# Three-query and six-query black-box cloning of a shipped COO application

**Date:** 2026-11-17. **Classification:** Intermediate adversarial experiment, pending pinned full cross-platform execution. **Author:** Agent 17.

## Question and frozen target

Can the three advertised numeric exports in the genuinely distributed, three-module [polyvariant COO application](../examples/polyvariant-app/generated/) be functionally reconstructed without its source compiler, original private implementation or static deobfuscation?

The published `math.mjs` contains randomized two-path affine arithmetic for `round1`, `round2`, and `round3`, about 5.9 KB in the checked-in emitted file. Its unchanged `digest` and the two additional modules implement a mutable session, host callback emission, Unicode payload handling and reflective state reads. The attacker sees the public generated files and can evaluate the published exported functions. Access to such functions is allowed by the COO full-control threat model.

The first structural hypothesis is that each selected helper is an **Int32 translation**, `f(x) = ((x|0)+c)|0`. A single oracle query at zero reveals `c = f(0)`. The separate weaker hypothesis is an **Int32 affine function**, `f(x) = (Math.imul(x|0,a)+b)|0`, for which chosen `f(0)` and `f(1)` reveal `b` and `a` modulo `2^32`. Neither procedure reads the producer's native module to infer its coefficients. The second attacker need not assume the slope equals one.

## Executable adversary and independent checks

The new [attacker executable](../sims/polyvariant-app-oracle-translation.js) loads exactly the actual checked-in generated files, runs one zero-input query per advertised numeric leaf, and writes an API-compatible replacement math module. It independently samples each leaf at one to generate a second affine-family replacement. **Total six distinct published-function calls** support both reconstructions; the translation attack uses the first three.

Only **after both replacements have been constructed** does the checker load the frozen native modules. It compares the two inferred module families, original, and published implementation on 4,096 held-out signed Int32 inputs per function. It also runs the full original, published, translation-clone, and affine-clone ESM graphs with 1, 50 and 1,000 events, comparing complete serialized application output and external callback trace. The [regression](../test/polyvariant-app-oracle-translation.test.js) asserts exact query counts, derived coefficients, expected comparisons, and app trace parity.

The original arithmetic is an explicit constant-addition chain. Direct simplification of its listed offsets yields `round1:+324`, `round2:+292`, `round3:+324`, with affine slopes `1,1,1`. This source-based derivation supplies a test expectation. It does **not** enter the inference algorithm. The existing independent [source-only polyvariant reconstruction](../sims/polyvariant-app-static-clone.js) had already shown that selected generated arithmetic was statically recoverable; this new challenge asks whether even a non-parser black-box attacker can clone it with few calls.

## Falsifying controls and limits

A nonlinear XOR function matches the translation attack's response at zero but diverges on another input. A quadratic function matches the affine attack's first two responses yet differs at input two. These deliberately establish that neither method recovers general JavaScript or arbitrary hidden high-entropy functions. Function-source introspection, unknown external APIs, object escapes, exact exception behavior for exotic inputs, and general unproved module graphs remain beyond this attack's claimed scope.

The deployed COO attacker can execute its own distributed functions; the query count is an attacker-observation cost, not a network quota or an SCO trusted-server cost. This is source-independent **behavioral** reconstruction under an explicit low-dimensional hypothesis, and does not recover the original source formatting or prove that other programs share that hypothesis.

## Execution status

The [manual two-platform polyvariant workflow](../.github/workflows/manual-polyvariant-affine.yml) now checks the specific regression, runs the standalone adversary, and invokes strict external JSDoc validation. [Run 44032537853](https://github.com/FlareZ123/obfs/actions/runs/44032537853) was queued at source `cef240a730869d494e7bcffd21ea27fc2c74ff7b`. Further affine-hypothesis work on main followed that dispatch, so its SHA does **not** contain the second interpolation attack. A later exact-source gate is needed before treating both as CI-verified. Source and native arithmetic offsets were independently simplified in local Node/Python; generated full-graph behavioral parity remains a **test expectation**, not a published executed result, until the gate reports success.

## Consequence for candidate selection

A multi-file application can contain genuinely transformed exported bytes while retaining a tiny learnable functional family. Counting the number of renamed symbols, branches, randomized variants, or protected source bytes therefore cannot independently establish adversarial reconstruction cost. A better comparison holds a realistic application fixed, includes native/minified competitors, and reports the cheapest successful attacker strategy with explicit input-query privilege, held-out checks and full-session cost. This result strengthens the need for the [conventional-minifier four-way control](../im-results/four-way-minified-control-design-2026-11-17.md), currently under independent review, before proposing client-only security gains.
