# Closed-world ESM dynamic-record reads: safe positive yield and inherited-key refusal (2026-11-16)

**Status:** intermediate compiler/semantic compatibility research. The first acceptance rule was falsified by a real external-host loader; the revised own-field rule has limited Node 22 Linux/Windows regression support. This is not an established confidentiality or full-control attacker-resistance result.

## Problem and baselines

The existing cross-file property renamer accepts a limited closed-world ESM graph. An unknown computed `object[key]` can retrieve inherited `constructor`, obtain a `Function` constructor, dynamically load a module and inspect an exported object's original own property names. A broad refusal in `src/cross-properties.js` prevented that genuine source-observation bug but reduced property coverage on the frozen six-module application.

On the original `examples/application-challenge/before/` graph, two observable function-source contracts already prevent transformation of two candidate private fields. Removing both observers with `ablate(original,'both')` is an intentionally distinct source program and previously yielded 2/2. The broad new unknown-member veto reduced the observer-free control to 0/2. Agent 15's standalone `sims/computed-refusal-ablation.js` showed that deleting the guard restored 2/2 and broke a hostile dynamic-loader ESM graph; see `im-results/computed-refusal-ablation-2026-11-16.md`. All coverage counts here measure the cross-file renamer, not other lexical transformations.

## Candidate and counterexample

The helper `safeClosedCallerRecordRead` introduces a narrow source-level proof for `schema[key]` when embedded in an immutable, one-parameter exported function's returned record. The helper requires an unescaped plain top-level literal record, a unique parameter read, only known direct named ESM callers with literal string arguments, and no unknown aliases/reexports. It is called by the existing global computed-member refusal, so all unproved member reads retain refusal.

The initial version admitted every caller literal other than known Object.prototype spelling. This was unsound even with literal arguments. Consider:

```js
// External host preload, not among compiler input files:
globalThis.RUNTIME_FACTORY = Function;

// Published ESM record:
const schema={externalFormat:'audit-v1',auditCount:3};
export function inspectRecord(key) {
  return {value:schema[key]};
}

// Published ESM entry:
Object.prototype.noSuchField=globalThis.RUNTIME_FACTORY;
const ctor=inspectRecord('noSuchField').value;
const remote=await ctor("return import('./state.mjs')")();
console.log(Object.keys(remote.state),remote.state.secretField);
```

The host preload can be placed through Node's actual `--require` argument, which the source-only compiler never sees. `noSuchField` is absent from the private record, so the getter follows the mutable `Object.prototype` chain and becomes the external `Function` constructor. The generated function dynamically imports the same state module under its original name. With native `state={secretField:41}`, exact native output of the integrated test was `[41,[["secretField"],41]]`. The earlier compiler tried to rename one private field anyway. This contradicts the assumption that merely knowing the argument's string spelling prevents untracked module consumers.

Reproducer: `test/cross-file-safe-record-read.test.js`; its red cross-platform run [43832326307](https://github.com/FlareZ123/obfs/actions/runs/43832326307) at `04d8f868909d11b342aad91000f6a24cbe42cb37` demonstrated expected `crossFile.properties=0`, actual `1` on both OSes. This was a real negative finding against our candidate, retained in the test.

## Narrower rule and scope

The updated helper requires **every direct caller string to be a declared own field** of the unescaped literal record. `schema['auditCount']` has the same value with or without ordinary prototype extensions because the own property resolves first. `schema['noSuchField']` is unproved and continues to veto cross-file property renaming. Constructor-inherited, dynamically derived keys, escaped functions, mutable records and unproved calls also decline.

The proof is intentionally restricted to a single syntactic function shape. It has no demonstrated whole-program, cross-realm proof against user-swapped global intrinsics, import maps, custom loaders, instrumentation, or adversarial host mutation of arbitrary built-in methods. It assumes the entire declared static source graph is the ownership boundary and only the recognized native record access semantics are considered. Arbitrarily controlled clients retain the power to copy/modify distributed source; the helper adds no anti-copy boundary.

## Frozen application: three independent semantic fixtures

The source-level harnesses `sims/application-challenge-refusal-yield.js` and `sims/application-challenge-observer-ablation.js` preserve the frozen original and create independent diagnostic variants. Each generated program is evaluated against its **own exact original variant** by a fresh Node ESM loader.

| Variant | Source change | Renamed private fields | Original bytes | Delivered bytes | Differential | Public-only clone |
|---|---|---:|---:|---:|---:|---:|
| Original, both observers | None | 0/2 | 2,786 | 2,786 | 84/84 | 160/160 |
| No source observers, missing-key read kept | Diagnostic removal of two observers | 0/2 | 2,794 | 3,043 | 84/84 | 160/160 |
| No observers, own-key-only | Additionally replace `inspectRecord('noSuchField')` with `inspectRecord('auditCount')` | 2/2 | 2,793 | 3,058 | 84/84 | 160/160 |

**Important:** The no-observer missing-key variant still changes all six files under `identifiers:true`; this is unrelated lexical work. Count private-field names separately to avoid interpreting a changed-file percentage as effective property protection. The final own-key-only fixture changes a public observable result, so it is a genuinely different program, never a transform of the original source.

The same source's targeted record test suite verifies own-key positive and five decline shapes, including the external host preloader, under actual Node ESM.

Two-platform signed [GitHub Actions 43833260772](https://github.com/FlareZ123/obfs/actions/runs/43833260772) at exact SHA `33b0450bb79f6ab98ffab4ab187d856309d50a69`: strict JSDoc suites, 20 targeted property/adversarial tests, frozen application differential and independent copy attacks passed on Windows Node 22.23.4, Ubuntu Node 22.23.4 and the legacy Node 22.0.0 job. The Linux+Windows broader semantic regression at earlier weaker patch was [43831660352](https://github.com/FlareZ123/obfs/actions/runs/43831660352); the narrowed patch requires a fresh broad semantics pin before generalization.

## Whole-process runtime budget

Nine alternating original-vs-delivered *fresh process* trials per measured workload for the intentionally modified own-key-only graph. Includes Node startup, ESM load, initialization, complete executed work and output. Medians:

| Node 22.23.4 | One-event native/emitted (ms) | Ratio | 80-case native/emitted (ms) | Ratio |
|---|---:|---:|---:|---:|
| Windows | 56.0741 / 54.8556 | 0.97827x | 69.6413 / 69.6972 | 1.00080x |
| Linux | 24.3375 / 24.3283 | 0.99962x | 33.8390 / 34.3456 | 1.01497x |

These four sampled ratios fall below 2.5x. They are narrow local-runner observations, not a general threshold proof, representative browser timing, or measure of dynamic-program cost.

## Attacker model and next evidence

An independent public-only `copyAttack` reproduces all **160/160 heldout** outputs for each app variant without the original source. This remains an unbroken functional copying attack on COO. The private exported object has emitted names available to an instrumented authorized runtime. For genuine secrecy of withheld implementation, SCO must put that implementation behind a trusted boundary; unlimited authorized online relaying still remains possible under the documented threat model.

Future work should seek a receiver/prototype-independent, consumer-aware proof that retains coverage on truly unchanged source without allowing inherited `Function` extraction. Test hostile user modifications of `Reflect.ownKeys`, `Object.getOwnPropertyDescriptor`, ESM specifier resolution and browser import maps explicitly. Any broader transformation must preserve the included negative host-loader regression and report the actual protected work fraction, reconstruction cost and full-process performance.

**Reproduction:** `node --test test/cross-file-safe-record-read.test.js`, `node sims/application-challenge-refusal-yield.js`, `node sims/application-challenge-observer-ablation.js`, `node sims/verified-record-session-profile.js`, and the existing manual application GitHub Actions workflow.
