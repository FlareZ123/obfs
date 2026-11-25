# Agent 10: FramePosition-preserving prototype — no-go review

**Date:** 2026-11-25  
**Experimental branch:** `agent10/string-frameposition-prototype-20261125`  
**Exact latest branch head reviewed:** `6e3c6c8d5dfb098f5bf9de89b611fefd9be21807`  
**Related identifier-only prototype:** `agent10/identifier-span-preserving-prototype-20261125` at `6ec6bdb35bcf74c6573e02694612b44e982db64d`  
**Disposition:** PARK / NO-GO. Do not integrate this prototype into main or PR #372.

## Scope

The experiment attempted to preserve source coordinates while retaining some identifier and string rewrites. The identifier pass pads shortened replacements to the original UTF-16 token width and refuses transformations such as shorthand expansion when it cannot preserve the span. The string pass replaces eligible literal tokens with a short helper call plus padding and appends a lazy decoder.

This is a narrow source-coordinate compatibility experiment, not a new obfuscation architecture or a security result.

## Full manual-validation result

The unfocused `manual-validation.yml` run [45553988346](https://github.com/FlareZ123/obfs/actions/runs/45553988346) checked out the exact latest branch head `6e3c6c8...` and executed the full Node 22 job on Ubuntu and Windows.

| Platform | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Ubuntu | 5,451 | 4,989 | 437 | 25 |
| Windows | 5,451 | 4,974 | 434 | 43 |

Both jobs failed. The failed-test indexes show broad regressions, not one isolated source-container case. Examples include the hot-object benchmark, local-parameter owner profile, browser parameter-owner transformation, private declaration reader, array-owner flow/grid, bound-native-constructor source-observer controls, URL/WebIDL positive controls, and the Agent 9 unsupported-shape suite. The Ubuntu index also includes a native-intrinsic callback Chromium source-observation failure.

The earlier unfocused run [45553797812](https://github.com/FlareZ123/obfs/actions/runs/45553797812) at `ff8f48f...` was already red on both platforms, with four positive-yield failures called out in Agent 3's messages. The later run at `6e3c6c8...` is the stronger current-head receipt and must supersede any suggestion that the prototype passed full validation.

### Source-level diagnosis needs correction

Agent 3's 05:34 message and the earlier consolidated PR report attributed the initial four yield failures to the guard rejecting every FunctionDeclaration because FunctionDeclaration nodes were not admitted to `privateFunctionNodes`. I inspected `src/properties.js` at the exact `6e3c6c8...` branch head:

- `collectProofInventory` collects `FunctionDeclaration` nodes.
- `callableBindings` explicitly includes uniquely bound FunctionDeclaration nodes.
- The direct-call-only use check can add those nodes to `privateFunctionNodes`.

Therefore, the statement that ordinary FunctionDeclarations are categorically not admitted is not source-accurate for this head. The broad failures are real, but the exact reason each fixture is refused still needs test-specific diagnosis; do not repeat the earlier explanation as an established cause. The guard is clearly associated with the experiment's wide refusal surface, but the full failure index should be classified against exact AST/use paths before making a narrower causal claim.

## 2.5× compute-budget failure

The prototype's own test `test/agent10-string-frameposition-performance.test.js` failed on both platforms. It measured seven alternating-order Node dynamic-import samples for a million-iteration hot string-reader workload:

| Platform | Median native | Median generated | Generated/native |
|---|---:|---:|---:|
| Ubuntu | 5.759 ms | 16.555 ms | **2.875×** |
| Windows | 3.639 ms | 11.735 ms | **3.225×** |

These are measured Node parse/evaluate-plus-workload timings for this fixture, not a universal runtime theorem. They are nevertheless strict observed >2.5× pairs for the tested COO workload and therefore a veto under the repository's budget rule. The benchmark also used only one encoded string, so it does not establish the cost of decoding a large table on first use.

## Runtime extraction and classic-script findings

The module/CJS lazy helper's encoded table and XOR key are present in the emitted source. More importantly, `test/agent10-string-helper-instrumentation.test.js` demonstrates that a preloader replacing `String.fromCharCode` can record the decoder's arguments and reconstruct the exact plaintext string. The helper therefore does not provide runtime-extraction resistance against the stated instrumented-client threat model.

The classic-script path had a separate confirmed problem before the later guard was added. Actual emitted `sourceType: 'script'` output used a top-level global-lexical string table; a prior classic script could collide with that binding, and a later script could read the fully decoded table. The corrected red-first compiler/environment run [45555342775](https://github.com/FlareZ123/obfs/actions/runs/45555342775) reproduced both failures on Ubuntu and Windows. The current branch now declines the span-preserving string strategy for `sourceType: 'script'` and has a corresponding scope test. That is a conservative refusal, not a private-table solution or a security improvement.

## Focused receipts and their limits

- Chromium string FramePosition/value checks completed as focused runs [45551675346](https://github.com/FlareZ123/obfs/actions/runs/45551675346) and [45551689833](https://github.com/FlareZ123/obfs/actions/runs/45551689833). They did not run the full Node 22 job.
- The two PR #372 CommonJS source-observer controls completed as focused two-platform runs [45553652117](https://github.com/FlareZ123/obfs/actions/runs/45553652117) and [45553658587](https://github.com/FlareZ123/obfs/actions/runs/45553658587). These focused successes do not offset the full-suite red result or the measured performance breaches.
- The string helper's instrumentation test is an extraction demonstration, not a resistance test.
- No result here establishes anti-static reconstruction, hostile-runtime tamper resistance, URL/domain locking, SCO/SNO protection, or cross-file property-proof correctness.

## Decision

Park both experimental branches. Do not transplant the identifier/string passes into PR #372. The experiment has three independent disqualifiers: a large full-suite regression surface, observed >2.5× hot-loop cost on both operating systems, and straightforward runtime extraction of decoded strings. Classic scripts are now conservatively excluded rather than secured.

If source-coordinate preservation is revisited, it should be designed as one source-observation/edit-map contract shared by property, identifier and string consumers, with exact source pins, per-fixture refusal/yield accounting, active-frame and implicit-wrapper coverage, and a complete full-suite gate before any integration. COO startup and lazy first-use decoding remain inside the compute budget. Do not claim a security advantage from preserving coordinates.
