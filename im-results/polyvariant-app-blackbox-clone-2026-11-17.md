# Three, six, and twelve-query black-box cloning of a shipped COO application

**Date:** 2026-11-17. **Classification:** Intermediate adversarial experiment, pending pinned full cross-platform execution. **Author:** Agent 17.

## Question and frozen target

Can the three advertised numeric exports in the genuinely distributed, three-module [polyvariant COO application](../examples/polyvariant-app/generated/) be functionally reconstructed without its source compiler, original private implementation or static deobfuscation?

The published `math.mjs` contains randomized two-path affine arithmetic for `round1`, `round2`, and `round3`, about 5.9 KB in the checked-in emitted file. Its unchanged `digest` and the two additional modules implement a mutable session, host callback emission, Unicode payload handling and reflective state reads. The attacker sees the public generated files and can evaluate the published exported functions. Access to such functions is allowed by the COO full-control threat model.

The first structural hypothesis is that each selected helper is an **Int32 translation**, `f(x) = ((x|0)+c)|0`. A single oracle query at zero reveals `c = f(0)`. The separate weaker hypothesis is an **Int32 affine function**, `f(x) = (Math.imul(x|0,a)+b)|0`, for which chosen `f(0)` and `f(1)` reveal `b` and `a` modulo `2^32`. Neither procedure reads the producer's native module to infer its coefficients. The second attacker need not assume the slope equals one. A third, wider hypothesis allows **a separate affine function on even and odd input classes**, fitted from `f(0)`, `f(2)`, `f(1)`, and `f(3)`. Four samples per public function give twelve total chosen evaluations. Since division by two is noninvertible modulo 2^32, the half-difference identifies a slope modulo 2^31, which is sufficient within the same parity class after adjusting the intercept.

## Executable adversary and independent checks

The new [attacker executable](../sims/polyvariant-app-oracle-translation.js) loads exactly the actual checked-in generated files, runs one zero-input query per advertised numeric leaf, and writes an API-compatible replacement math module. It independently samples each leaf at one to generate a second affine-family replacement. **Total twelve distinct published-function calls** support all three reconstructions; the translation attack uses the first three and the generic affine attack uses the first six.

Only **after both replacements have been constructed** does the checker load the frozen native modules. It compares the two inferred module families, original, and published implementation on 4,096 held-out signed Int32 inputs per function. It also runs the full original, published, translation-clone, and affine-clone ESM graphs with 1, 50 and 1,000 events, comparing complete serialized application output and external callback trace. The [regression](../test/polyvariant-app-oracle-translation.test.js) asserts exact query counts, derived coefficients, expected comparisons, and app trace parity, including a synthetic case with genuinely different even/odd affine coefficients.

The original arithmetic is an explicit constant-addition chain. Direct simplification of its listed offsets yields `round1:+324`, `round2:+292`, `round3:+324`, with affine slopes `1,1,1`. This source-based derivation supplies a test expectation. It does **not** enter the inference algorithm. The existing independent [source-only polyvariant reconstruction](../sims/polyvariant-app-static-clone.js) had already shown that selected generated arithmetic was statically recoverable; this new challenge asks whether even a non-parser black-box attacker can clone it with few calls.

## Independent V8 replay of exact published bytes

At **2026-11-17 06:49 UTC**, a separate actual V8 JavaScript evaluation retrieved the checked-in public `generated/math.mjs` (Git blob `5710c38d299b36b74464b9353c5ff82ad59fcc34`, 5,883 characters) and evaluated its real exported numeric declarations. It obtained `f(0)` and `f(1)` for each public helper **before** retrieving the original file. It reconstructed both translation-only and unknown-slope-affine public modules by replacing only the three advertised function definitions, retaining the published `digest` body. Native math (Git blob `273e8f1e76d53fce94173ab9ff02c93984342787`, 832 characters) was retrieved **after** the initial two inferred modules had been built, exclusively for differential checking.

Actual observed coefficients were `round1:(a=1,b=324)`, `round2:(a=1,b=292)`, `round3:(a=1,b=324)`. All **12,288** deterministic Int32 held-out comparisons agreed across native, emitted, translation-clone and affine-clone helpers. All **30** full `digest(seed,message)` checks agreed across those four, including empty messages, Unicode, lone surrogate, NUL, and extreme seeds. This is an **executed, scoped source-evaluation observation**, separate from the queued GitHub Actions end-to-end multi-file tests. The V8 check stripped ESM `export` tokens to evaluate isolated declarations in one realm; it did not verify genuine ESM graph loading, network delivery, stateful host traces, or measured runtime. Those are still the responsibility of the committed Node/Chromium differential workflows.

The 12,288-input corpus is deterministic; it is strong falsification coverage for these particular functions, not a proof of full equivalence for arbitrary JavaScript inputs. The underlying frozen native arithmetic admits a separate algebraic proof of the offset values, but that proof was not given to the attacker during coefficient inference.

## Source-evaluated complete application and host trace replay

A second independent V8 replay fetched all **six** checked-in public/native `math.mjs`, `state.mjs`, and `entry.mjs` files. Both attack families were synthesized from public math function responses before retrieving the native modules. The evaluator removed the two known static ESM import statements and concatenated the three modules' declarations into one V8 source realm, preserving their executed function bodies and stateful behavior. This is a **combined-source differential**, not an authentic browser or Node ESM-loader test.

For each of the four variants (**native, published, translation-clone, affine-clone**), the evaluator ran 1, 50, 1,000 and 10,000 event records, including Unicode message payloads and an external `emit` host callback. Across **16 application invocations and 44,204 callback deliveries**, the complete serialized result and serialized emitted trace matched the native implementation exactly. All counters and results were computed from the real checked-in distributed files without the original source participating in coefficient inference. This extends the earlier 12,288 numeric and 30 digest V8 observations from individual leaves to the source-evaluated stateful application.

The separately committed Node test still provides stronger **authentic ESM** validation: isolated files, native import/link/evaluate, and per-source loader boundaries. The combined-source replay cannot establish those properties and cannot replace its pending pinned workflow.

## Four-query-per-function parity-affine generalization

The [same independent attacker](../sims/polyvariant-app-oracle-translation.js) now implements `synthesizeParityAffineClone`, recovering a separate affine rule on even and odd signed Int32 inputs. It queries the genuine published code at `0,2,1,3` for each of three exports, without consulting native math. An even or odd response difference must be divisible by two modulo 2^32; otherwise the model refuses. For each branch the canonical unsigned half-difference gives a slope modulo 2^31; the derived intercept completes a function that is consistent for all inputs of that parity under the stated hypothesis.

An independent source-evaluated V8 replay recovered **slope 1 and offset +324 / +292 / +324 in both parity classes**, then checked 4,096 deterministic held-out signed Int32 inputs per helper. It also ran native/published/translation/parity source-combined three-module applications on 1, 50, 1,000 and 10,000 events and observed full output and host trace equality across **16 runs / 44,204 callbacks**. The replay used actual checked-in public modules and read native sources only after parameter inference. It demonstrates functional recovery of a broader conditional class and does not verify real module loading, which the pending Node workflow must check.

As a falsifying control, `f(x)=x²` agrees with the inferred even branch at `x=0` and `x=2` but differs at `x=4`; therefore four fixed points alone cannot establish general nonlinear equivalence. The parity-affine model also makes no confidentiality claim for functions outside this restricted arithmetic family.

## Falsifying controls and limits

A nonlinear XOR function matches the translation attack's response at zero but diverges on another input. A quadratic function matches the affine attack's first two responses yet differs at input two. These deliberately establish that neither method recovers general JavaScript or arbitrary hidden high-entropy functions. Function-source introspection, unknown external APIs, object escapes, exact exception behavior for exotic inputs, and general unproved module graphs remain beyond this attack's claimed scope.

The deployed COO attacker can execute its own distributed functions; the query count is an attacker-observation cost, not a network quota or an SCO trusted-server cost. This is source-independent **behavioral** reconstruction under an explicit low-dimensional hypothesis, and does not recover the original source formatting or prove that other programs share that hypothesis.

## Execution status

The [manual two-platform polyvariant workflow](../.github/workflows/manual-polyvariant-affine.yml) now checks the specific regression, runs the standalone adversary, and invokes strict external JSDoc validation. [Run 44032537853](https://github.com/FlareZ123/obfs/actions/runs/44032537853) was queued at source `cef240a730869d494e7bcffd21ea27fc2c74ff7b`. Further affine-hypothesis work on main followed that dispatch, so its SHA does **not** contain the second interpolation attack. A later exact-source gate is needed before treating both as CI-verified. Source and native arithmetic offsets were independently simplified in local Node/Python; generated full-graph behavioral parity remains a **test expectation**, not a published executed result, until the gate reports success.

## Consequence for candidate selection

A multi-file application can contain genuinely transformed exported bytes while retaining a tiny learnable functional family. Counting the number of renamed symbols, branches, randomized variants, or protected source bytes therefore cannot independently establish adversarial reconstruction cost. A better comparison holds a realistic application fixed, includes native/minified competitors, and reports the cheapest successful attacker strategy with explicit input-query privilege, held-out checks and full-session cost. This result strengthens the need for the [conventional-minifier four-way control](../im-results/four-way-minified-control-design-2026-11-17.md), currently under independent review, before proposing client-only security gains.
