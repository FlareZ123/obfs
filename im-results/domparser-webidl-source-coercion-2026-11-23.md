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

## Equal-source esbuild control (23 November, second source pin)

After the initial diagnostic, the same test acquired a **third ordinary-esbuild arm**, generated from exactly the same source fixture using the repository's pinned `esbuild` package:

```js
transformSync(fixture.code,{format:'esm',target:'es2022',minify:true}).code
```

Source-pinned [GitHub Actions run 45185804896](https://github.com/FlareZ123/obfs/actions/runs/45185804896) checked `cb5c4742411e68f3b6e7be1c9089f37880d51867` in actual Ubuntu Chromium. Its source-paired summary was:

```json
{"cases":9,"valueMatches":9,"minifiedValueMatches":9,"sourceMismatches":6,"minifiedSourceMismatches":6,"publicStringRewrites":6,"privateRewriteControls":3}
```

Across three mode-labeled repetitions of each source fixture, **both** obfuscated and ordinary-esbuild-minified code changed the source text observed through DOMParser and Element.setAttribute, while both preserved all nine ordinary return values. The three inert controls also maintained text equality. The esbuild control establishes that the selected distinction is a general source-spelling/minification compatibility issue, not evidence that obfs is uniquely defective relative to an equal-source ordinary minifier. This control does not measure attack effort, authorization, code secrecy, or a strong semantic guarantee for either tool.

The overall workflow remained **RED** on the same two earlier, unrelated positive-property-yield assertions in `test/function-declaration-reader-proof.test.js` on Ubuntu and Windows. The Chromium three-arm step was green and logged all nine triplets before those existing failures; no full matrix green claim follows. Neither the original compiler `src/` nor any production entrypoint changed.

## Detached native calls, bound calls and Reflect.apply extension

The independent same-source Chromium matrix was extended with four further syntactic paths: `DOMParser.prototype.parseFromString.call`, `Reflect.apply(DOMParser.prototype.parseFromString,...)`, `Element.prototype.setAttribute.bind` followed by a call, and `Reflect.apply(Element.prototype.setAttribute,...)`. These are not general proofs of alias tracking. Each example passes `observed` directly into the native method at runtime.

At exact source pin `d0c915a4928d4e97c27f09961c31415af7af4b9f`, [GitHub Actions run 45186574961](https://github.com/FlareZ123/obfs/actions/runs/45186574961) executed the enlarged diagnostic in Ubuntu real Chromium. Summary:

```json
{"cases":21,"valueMatches":21,"minifiedValueMatches":21,"sourceMismatches":18,"minifiedSourceMismatches":18,"publicStringRewrites":18,"privateRewriteControls":3}
```

The six native source-coercion shapes (two original direct paths and four indirect paths) × three mode repetitions each changed observed callable text in **both** obfs and esbuild. All 21 original/compiled and original/minified ordinary values matched. Each of the 18 source-observing obfs compilations contained positive string rewrites, and all three nonescaping string-rewrite controls preserved runtime output. The targeted Chromium step passed; the broader workflow independently failed on two prior `function-declaration-reader-proof` positive-yield assertions on both platforms before reaching all remaining steps.

This supplies bounded evidence that a fix recognizing only `DOMParser.parseFromString(...)` or `element.setAttribute(...)` direct spelling is incomplete for the stated native-source equivalence contract. The precise exposed-source behavior and private rewriting requirement must be checked at the compiled artifact, and any strong security claim needs a separate attacker-cost evaluation.

## Property renaming contrast: safe refusal under the same native consumers

The browser matrix was augmented with original source functions capturing an owned `owner.secretField`, observed through the two **direct** DOMParser and Element.setAttribute paths. Unlike the preceding string-encoder fixtures, these source inputs select `properties:true`, `strings:false`, `identifiers:false`, and `closedWorld:true`. The same-source esbuild minifier remains the third arm.

In exact-source [run 45187092241](https://github.com/FlareZ123/obfs/actions/runs/45187092241) on `863eaa3d568965251fac1e8bcd67d5718041d2a1`, Ubuntu Chromium logged:

```json
{"cases":27,"valueMatches":27,"minifiedValueMatches":27,"sourceMismatches":18,"minifiedSourceMismatches":24,"publicStringRewrites":18,"publicPropertyRewrites":0,"privateRewriteControls":3}
```

The six newly added property-specific original/emitted pairs retained byte-exact callable source and ordinary behavior, but **each emitted zero actual property rewrites**. In the same six cases, ordinary esbuild changed native observed source text; across all 27 cases both build arms preserved ordinary values. The earlier 18 positive string rewrites continued to produce the same 18 native source mismatches.

Interpret this narrowly: the property transform's conservative refusal prevents this particular source-observation incompatibility, at the cost of zero property-obfuscation yield for these public-source fixtures. This evidence does **not** prove a general property alias safety theorem. It also does not demonstrate the property pass can rewrite otherwise equivalent nonescaping ownership graphs under these exact fixture conditions; a positive nonescaping property control is the appropriate follow-up.

Again, the targeted browser diagnostic passed and the full workflow failed at two unrelated positive-yield assertions per OS. No production source file changed.

## Positive private-owned property yield confirms contextual refusal

A distinct `nonescaping-owned-property-control` uses the same captured local `owner.secretField` and `observed()` function as the exposed native coercion pair, but no native source-reading host API. It produces only a primitive `globalThis.__obfsResult`, with `coerced:'inert'`. The fixture compiles with identical explicit `strings:false`, `properties:true`, `identifiers:false`, and `closedWorld:true` options.

[Source-pinned run 45187527611](https://github.com/FlareZ123/obfs/actions/runs/45187527611), code `801960fbef50205cfc398bc5cdbcaa3b45a8f505`, expanded the real-Chromium, same-source-esbuild differential to **30 original/emitted/minified comparisons**. Summary:

```json
{"cases":30,"valueMatches":30,"minifiedValueMatches":30,"sourceMismatches":18,"minifiedSourceMismatches":24,"publicStringRewrites":18,"publicPropertyRewrites":0,"privateRewriteControls":3,"privatePropertyRewriteControls":3}
```

Specifically, the compiler made exactly **one actual owned-field rewrite in each of the three private nonescaping property controls**, and all three preserved ordinary behavior. With direct DOMParser/Element source observation, the otherwise similar six property cases each made **zero owned-field rewrites**, preserving the text. The private string controls continued to rewrite positively (3/3) and the eighteen observable string rewrite cases still changed function source. All thirty ordinary return values matched for both transformed and minified arms.

This comparison supports a **bounded positive-yield vs conservative-refusal contrast** in the property engine, beyond a trivial universal zero-rewrite implementation. It does not mean the property engine soundly recognizes every Web IDL source sink or that every source-readable callable is protected. The string pass has a distinct observed source-compatibility gap. The full workflow remains RED on two prior property-yield assertions elsewhere, while the targeted Chromium step passed.
