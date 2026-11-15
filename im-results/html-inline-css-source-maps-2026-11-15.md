# Inline HTML CSS source-map annotation as an original-source distribution channel

**Agent 20; 2026-11-15. Intermediate bounded source-distribution audit.**

## Problem and witnessed input

The source-map preflight already refused source-map-bearing `.css` files, HTML inline `<script>` and SVG `<script>` markup. Its HTML5 `parse5` walker nevertheless permitted a `<style>` element with a CSS source-map annotation. An ordinary HTML document can embed CSS through `<style>`, and the stylesheet annotation can contain a base64-encoded JSON version-3 map with an original source copy in `sourcesContent`. The public HTML asset was previously distributed unchanged, exposing the original code through the stylesheet bytes.

The new `test/html-asset-disclosure.test.js` case builds a real source-map JSON including `const PRIVATE_HTML_STYLE_CANARY=921084;`, embeds it in a `data:application/json;base64,...` URL in a `/*# sourceMappingURL=... */` HTML inline stylesheet, and tests two other supported HTML placements: a linked map URL and a `<template>`-nested stylesheet. The previous version of `findInlineHtmlSource` did not inspect `<style>` text nodes and would have accepted these map-bearing assets.

## Change

`src/html-assets.js` now passes all direct text-node strings inside a `<style>` element to the shared `hasCssSourceMapDirective` scanner in `src/css-source-maps.js`. This scanner skips CSS quoted strings and detects actual `/*#` or `/*@` annotations. The check works inside `<template>` via the existing parse5 traversal, rejects the entire HTML asset before any output, and leaves benign HTML bytes unchanged. No additional runtime operation is introduced in generated obfuscated JavaScript.

The same dedicated scanner is also consumed by `src/svg-assets.js` for `<style>` text/CDATA and by `src/source-maps.js` for `.css` files. This avoids divergent classifiers for the three file types.

## Evidence

The exact paired [manual asset attack and regression run 43737295969](https://github.com/FlareZ123/obfs/actions/runs/43737295969) at source SHA `91aaef13bc1062dc2a28f7185f0a9eb2e6436677` **passed Ubuntu and Windows Node.js 22**, including:

- original-source asset extraction against the pinned vulnerable historical baseline;
- XML MIME attack against the pinned prepatch baseline;
- current `test/html-asset-disclosure.test.js`, `test/svg-asset-disclosure.test.js`, and `test/css-source-map-annotation.test.js` suites;
- current `npm run typecheck` (strict JSDoc).

The separate wide transform-safety [run 43736924343](https://github.com/FlareZ123/obfs/actions/runs/43736924343) was red on two unrelated ESM property-rename expectations; it predates this HTML change. Do not treat either narrow green gate as a full `npm test` release.

## Boundaries

The scanner catches standardized CSS annotation syntax in HTML inline `<style>` elements. Arbitrary HTML data attributes, external CSS, JSON, serialized copies of original code, and every possible encoded source representation remain outside this particular proof. No browser was used to demonstrate whether DevTools automatically requests such a CSS map, since **source is already present in the delivered asset bytes**, regardless of browser behavior. This is a source-publication safety improvement and does not add cryptographic integrity, client authorisation, runtime extraction resistance, or general deobfuscation resistance.

## Exact immediate-prepatch extraction experiment

A separately reproducible, source-only attacker at [`sims/inline-style-map-attack.js`](../sims/inline-style-map-attack.js) loads the exact immediate prepatch compiler `0a072818f9d46112e25626e5de7ffc357678ee08` and the protected HEAD and then tests three delivered assets: standalone SVG inline CSS, HTML head inline CSS, and HTML template-nested inline CSS. The attacker sees *only the emitted asset*: a regular expression captures its `sourceMappingURL=data:application/json;base64,...` annotation, base64 decodes the JSON map, and recovers the original text `function privateScore(x){return x*173+59;}` through `sourcesContent[0]`. No JavaScript obfuscator source, seed, original input or browser instrumentation is used in the extraction function. The harness checks all three COO/SCO/SNO build modes, then separately performs a real baseline SCO HTTP GET and protected SCO handler refusal.

The paired [manual asset extraction workflow 43737879129](https://github.com/FlareZ123/obfs/actions/runs/43737879129) at exact SHA **`64e81e15245fbd0cc5cf9afc59f5ce3fc6908b65` passed on both Ubuntu and Windows Node.js 22**, including the immediate-prepatch paired attacker, existing historical source-disclosure controls, focused HTML/SVG/CSS regression suites and strict JSDoc check. The experiment demonstrates **9 prepatch copied source maps / 9 postpatch build refusals across three modes**, plus **3 prepatch SCO HTTP source-map extractions / 3 protected SCO publication refusals** on each OS. These are synthetic static source-extraction fixtures, with no claim that a browser would automatically use such an annotation or that every general-purpose source encoding is blocked.

This paired test is stronger evidence than the standalone compile refusal test alone. It establishes which precise committed prior behavior was changed and verifies the recovery method with a source-only attacker.
