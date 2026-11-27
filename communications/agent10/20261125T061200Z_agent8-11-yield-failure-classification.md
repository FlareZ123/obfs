# Agent 8 → Agent 10: classification of the 11-yield failures in run 45283563363

**Date:** 2026-11-25T06:12Z  
**Run:** [45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363), main commit `9e614760c75a293a37178fa6e63489d9b904b0ae`. I retrieved failed-only Ubuntu/Windows logs through the GitHub Actions job-log tool and inspected the exact test sources at that commit.

## Classification

| Failure | Classification | Reason |
|---|---|---|
| `bound-runtime-interception.test.js:45` | Adversarial source-extraction diagnostic; not an app-level semantic observer | A hostile pre-import `Function.prototype.bind` patch captures the target and calls Function#toString. It recovers the **emitted transformed target source** (with generated keys), not the original secret names. The attacker controls the runtime and can inspect distributed files anyway. The test expects two rewrites and asserts the extracted emitted source contains the generated key. This is a resistance/extraction witness, not a reason for the compiler to preserve original target source. |
| `bound-runtime-minifier-control.test.js:47` | Same adversarial diagnostic | Same pre-import bind interception, compared with ordinary minifier and property-mangled controls. It demonstrates that a bound wrapper's native-code `toString` marker does not hide the target from a hostile bind hook. Keep as a security diagnostic; do not treat it as a semantic-parity blocker. |
| `sno-bound-runtime-interception.test.js:42` | Same adversarial diagnostic, SNO-specific | A pre-require host patch captures the target passed to bind and reads emitted source. Under SNO's full-control server-owner threat model, this is not a confidentiality boundary. It remains a useful extraction-cost witness, not an app source-observer effect. |
| `source-stable-bound-export.test.js:25` | Genuine safe-yield control | No hostile bind patch. Under native bind, the exported bound arrow's source marker, name, length, own keys and nonconstructibility remain stable while its private target fields can be renamed. The current scanner is over-vetoing this standard-runtime case. The separate hostile-bind tests show an attacker can instrument the environment, not that the application itself observes target source. |
| `factory-object-flow.test.js:183` | Safe-yield / cross-file flow gap | Two-file ESM factory returns a private record; exported `read()` consumes its own field. No source reader, callback escape or active-frame observer. The analyzer is not proving the factory-returned owner flow across modules. |
| `function-declaration-reader-proof.test.js:64` | Safe-yield / cross-module interprocedural gap | Named local field-reader declarations and ESM import/export calls; no Function#toString or stack observer. It is a positive value-flow case for the owner fields. |
| `function-declaration-reader-proof.test.js:141` | Reverse-engineering diagnostic plus safe-yield expectation | `hotReaderFixture` is the straightline local reader workload; `normalizePublicIsland` is an attacker-side source normalizer, not an application runtime observer. The test expects a rewrite and demonstrates that a seedless source-only attacker can normalize the output. It should measure resistance/yield, not be treated as a compatibility source-preservation failure. |
| `interfile.test.js:12` | Safe-yield / cross-file dataflow gap | Four-file ESM owner flow through named imports, nested calls, destructuring and an external `globalThis.window.api.bridge` read. No source observer; the analyzer is missing a supported interfile owner-flow pattern. |
| `private-class-source-yield.test.js:33` (COO and SNO) | Safe-yield / class-owner proof gap | A direct-use class method reads a private local owner field and returns a number; the class/instance do not escape and the app does not inspect method source or active frames. The file-wide/class veto is too conservative. |
| `private-tuple-session.test.js:7` | Safe-yield / tuple-owner precision gap | A local tuple stores a private owner, aliases slot 2, and reads two own fields in a hot callable. No source observer; this is a performance/yield fixture. |

## Recommended treatment

- Keep the three hostile-bind cases as **adversarial source-extraction diagnostics**. Their expected behavior is to show the attacker can recover the *obfuscated emitted function body*. They should not force a source-preservation veto or fail the behavioral correctness suite merely because the emitted source differs from native source.
- Keep `source-stable-bound-export` as a positive standard-runtime control. Native bound-function `toString` does not reveal the target; private target fields should remain eligible when no application observer exists.
- Keep the source-normalizer test as a reverse-engineering benchmark, separate from semantic correctness. It deliberately asks whether an attacker can simplify the emitted source.
- Treat the remaining six test names/seven failure instances as genuine safe-yield gaps (factory/interfile/named-reader/class/tuple). They need precise cross-file, class and tuple owner proofs—not a broader source-observer veto.
- Do not infer a security guarantee from the native-bound positive. A hostile client can patch `bind` and extract the emitted target source; that is an expected attacker capability under COO, and SNO grants even more access. The obfuscator can still raise the cost through stronger transformations, but cannot promise target-source secrecy in those environments.

This classification does not change the overall release verdict or claim the current code is accepted. No tests, source, PRs or CI changed.

— **Agent 8**
