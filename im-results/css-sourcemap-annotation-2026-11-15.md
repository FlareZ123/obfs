# CSS sourceMappingURL annotations: an opaque-asset source disclosure channel

Date: 2026-11-15. Author: Agent 15. Status: intermediate build-time and serve-time security regression with executable tests. No generalized source confidentiality claim.

## Standards-backed source of risk

ECMA-426 §7.1.2.2 specifies source-map URL extraction in CSS from block comments, including the `/*# sourceMappingURL=... */` annotation. [MDN's Source map glossary](https://developer.mozilla.org/en-US/docs/Glossary/Source_map) illustrates `/*# sourceMappingURL=index.css.map */` at the end of a compiled stylesheet. Source-map JSON can carry original source text in `sourcesContent`, including if embedded into a data URL.

Before this change, `src/source-maps.js` refused direct map JSON files, map filename extensions, and annotations in JavaScript AST comments, but a supplied `style.css` opaque asset was copied unchanged, even when it included `/*# sourceMappingURL=data:application/json;base64,... */`. That path could publish original source through a supported output format without ever presenting it to the JavaScript compiler. This is one concrete build/serve configuration hazard.

## Implementation and exact tests

`hasCssSourceMapDirective` in `src/source-maps.js` now walks CSS source once, skipping quoted strings and finding real `/* ... */` comments. It flags #/@ sourceMappingURL annotations inside comments, including external links and inline base64 data URLs. The preflight applies this check to `.css` asset paths case-insensitively in all COO, SCO and SNO transformation modes and in `createScoHandler`. It rejects invalid UTF-8 or NUL-padded CSS assets to avoid silently skipping annotations in unexpected encodings. The CSS runtime content is unmodified when no annotation is found; this adds no runtime interpreter or work to the protected script.

`test/css-source-map-annotation.test.js` covers a base64 inline data URL with a complete `sourcesContent` canary, external URLs, alternate @ marker, UTF-8 BOM, unrelated comments, CSS strings containing deceptively similar comment text, CSS string escapes, unterminated string recovery on newline, and invalid UTF-8/UTF-16/NUL. It validates rejection across COO, SCO and SNO and direct SCO HTTP handler construction, and that safe CSS Buffer bytes are unchanged across all three modes.

Linux and Windows focused semantic tests and JSDoc typecheck **passed** [workflow 43713706583](https://github.com/FlareZ123/obfs/actions/runs/43713706583) at exact SHA `8e1ed078c4e52ba8dad53e3b91adc9db4bb2fab9`. The final code slightly simplified error propagation at commit `9e6ef78fe31b25c526850b84f6070c9edbf2026a` without changing the scanner or accepted shapes; a subsequent exact-head run should be retained before release.

## Boundaries

A disguised arbitrary `data:application/json` URL in CSS is not automatically a source map. This check covers the standardized annotation channel. CSS can also contain arbitrary source as comments, custom properties or URLs, and a private source may be shipped through other assets or nonstandard data encodings. A CSS source-map header added outside this application remains an external deployer responsibility. The detection rejects entire annotated CSS assets rather than rewriting comments, preserving the fail-closed publishing model.

The adversary's dynamic analysis, tamper resistance and client authorization capabilities remain unchanged. This is a narrow disclosure-preflight correction, not a novel obfuscation primitive.
