# Browser Web IDL function-source coercion: DOMParser and attributes

**Date:** 23 November 2026. **Status:** independently reproduced compatibility counterexample, test-only research branch. Not an established confidentiality, tamper-resistance, environment-locking, or performance result.

## Reproduction boundary

A source program declares:

```js
function observed(){return 'source-observed-literal';}
```

The source body is passed, without an explicit `Function.prototype.toString` call, to one of two browser-native string consumers:

1. `new DOMParser().parseFromString(observed,'text/html').body.textContent`.
2. `element.setAttribute('data-source',observed)` followed by `getAttribute`.

Both browser methods coerce the callable to text, yielding its source in the tested Chromium environment. The source also calls `observed()` so ordinary return-value equivalence is checked separately.

Official context: [HTML Standard DOMParser API](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-parsing-and-serialization), [DOMParser.parseFromString reference](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString), and [ECMAScript Function.prototype.toString](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring).

## Executable receipt

- Test-only branch: `agent48/domparser-coercion-20261123`.
- Source-pinned [GitHub Actions run 45185194627](https://github.com/FlareZ123/obfs/actions/runs/45185194627), exact tested SHA `2c9388a648e2a3da0726cde55183904c50159aeb`, derived from main `188e38dd4b10e9101292280efea5792d6a7f71a5`.
- New diagnostic: `test/domparser-webidl-source-browser.js`, invoked as an early Ubuntu-only real-Chromium step in existing `.github/workflows/manual-source-proof-triage.yml`.
- The independent source and transformed modules are served over loopback HTTP, loaded through a real ESM import, and observed through DOM page output using headless Chrome. There is no simulated DOMParser in the measured browser step.
- Compilation uses `obfuscateFiles` with `strings:true`, `properties:false`, and `identifiers:false`, across `coo`, `sno`, and `sco`, with deterministic mode/fixture seeds.

The targeted Chromium step **passed** as a diagnostic and produced:

```json
{"cases":9,"valueMatches":9,"sourceMismatches":6,"publicStringRewrites":6,"privateRewriteControls":3}
```

Every one of the **six public-source cases** (2 Web IDL paths × 3 compiler modes) changed the native API's observed source text while preserving the function's return value. In the original, the body includes `return 'source-observed-literal';`; in emitted code it instead includes `return _o... [0];` (the actual seed-specific generated identifier differs by mode). The compiler reported positive literal rewrites in all six cases: DOMParser `literals:2`, attribute path `literals:4` for each mode.

Three additional `nonescaping-control` cases retained exact original/emitted primitive output and **positive string transformation yield** (`literals:2` in each mode). This bounds the counterexample to genuine source-text observations rather than the compiler simply refusing the pass in all configurations.

The **overall** source-proof workflow concluded **failure**, independently of this browser diagnostic: the already-present `test/function-declaration-reader-proof.test.js` failed two owner-property positive-yield assertions on both Ubuntu and Windows after the diagnostic. On Windows, the Chromium step is skipped by its explicit OS predicate. Neither the full workflow nor a compiler fix is green. The new test and workflow are the only branch modifications in this receipt.

## Interpretation and recommended integration

The experiment establishes a bounded behavioral incompatibility under an application contract that includes the text produced when Web IDL converts a function. It shows why protecting only explicit `fn.toString()` or direct `String(fn)` is insufficient for exact source behavior. It does **not** establish that a source-observer guard for these two sinks is complete: aliases, first-class native method references, custom browser globals, and other Web IDL APIs require independent analysis.

Route the witness to the canonical `workplace/agent3-source-observer-decoder-intake-2026-11-22.md` decision table as an independent falsifier. Before accepting a fix, convert the diagnostic to an original/emitted **source-parity assertion**, retain its three positive nonescaping rewrite controls, and rerun both the targeted Chromium probe and the source-pinned comprehensive Linux/Windows/Chromium/JSDoc gates. A compiler may conservatively decline unsafe string rewrites in these cases; any claimed positive protected-work yield should be measured elsewhere and reported precisely.

This test-only branch must not be presented as an integrated compiler repair. Global product release status remains **RELEASE-BLOCKED**.
