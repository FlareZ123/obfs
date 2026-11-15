# Original-source maps inside inline SVG CSS (2026-11-15)

**Agent 20. Status:** intermediate source-distribution guard, independently falsifiable with a historical prepatch scanner. No claim of advanced runtime obfuscation or resistance to full-control attackers.

## Original gap

The repository refused `/*# sourceMappingURL=...` comments in standalone `.css` assets, but `src/svg-assets.js` parsed SVG XML without inspecting character data inside `<style>` elements. An SVG can embed a CSS stylesheet using `<style>` as documented by the [SVG 2 styling specification](https://www.w3.org/TR/SVG/styling.html) and [MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/style). SVG assets were copied byte-identically to COO/SNO output directories or served as SCO assets, so such a document could distribute an original-source map inside the CSS annotation.

A positive static witness:

```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <style><![CDATA[
    circle { fill: red }
    /*# sourceMappingURL=data:application/json;base64,PHNvdXJjZS1tYXAtY2FuYXJ5Pg== */
  ]]></style>
  <circle r="3"/>
</svg>
```

The illustrative base64 above is a placeholder. The real executable regression constructs a version-3 JSON source map with `sourcesContent:['const PRIVATE_SVG_STYLE_CANARY=728391;']` and embeds its exact base64 in the SVG stylesheet. It also tests a linked `.css.map` URL, an XML entity within the annotation name, and an annotation split by a CDATA boundary. Before this fix, the SVG scanner had no `text`/`cdata` event handling and returned `null` for these safe-from-XML-syntax yet map-bearing assets.

## Source and tests

The scanner used for standalone CSS assets has been extracted without semantic changes into `src/css-source-maps.js` and re-exported from `src/source-maps.js`. Both `src/source-maps.js` and `src/svg-assets.js` call the same implementation. SVG XML parsing now accumulates `text` and `cdata` events inside a style element and scans the concatenated stylesheet when the element closes; unsupported nested elements within a style are rejected. Original bytes of benign SVG styles remain unchanged.

`test/svg-asset-disclosure.test.js` has the new `SVG inline styles cannot publish CSS source-map annotations or source contents` case, exercising four positive refusals in COO, SCO and SNO plus direct SCO static-serving construction, and one valid CSS string that merely *quotes* annotation-like text. `test/css-source-map-annotation.test.js` remains the unmodified standalone CSS regression to validate extraction.

## Evidence and limits

[Manual transformation semantics run 43736924343](https://github.com/FlareZ123/obfs/actions/runs/43736924343), pinned to exact `5fd73a9186a44c3ae95f17641888dc78ca98380f`, executed both SVG tests on Ubuntu and Windows: **new SVG CSS case #217 passed on both**, preceding animation list case #216 also passed, and all existing CSS annotation tests passed. **Overall run failed, 220/222 test assertions passed per OS**, due the two existing unrelated `test/destructuring-assignment-flow.test.js` ESM property-coverage assertions (#88/#89), observed in the earlier run too. The workflow did not reach static typecheck. No whole-repository green validation is asserted.

The `saxes` parser's `text`, `cdata`, and `closetag` event contracts are documented in the pinned [saxes 6 API](https://www.jsdocs.io/package/saxes). This study does not establish whether a browser automatically fetches a CSS source map from inline SVG styles or executes a script inside the stylesheet; its threat endpoint is **publishing the source map text in a served asset**. It does not prevent arbitrary original-code comments, external assets, CSS custom-property data, obfuscation reversal, runtime extraction, or unauthorized execution under a fully controlled COO/SNO runtime. Preflight adds build/serve work only, with no additional protected-program runtime operator.

The guard is deliberately narrow. SVG style attributes and externally imported stylesheets remain outside this specific source-map-annotation path, and the general asset disclosure policy remains incomplete.

## Paired source-only extraction and full scoped guard

A later [paired extraction harness](../sims/inline-style-map-attack.js) uses exact prepatch commit `0a072818f9d46112e25626e5de7ffc357678ee08` to recover a true version-3 source map's `sourcesContent[0]` directly from the copied SVG's base64 stylesheet annotation. It requires no original input and then confirms current build-time refusal. Its separate HTML head and template variants use the same CSS marker and payload. The [Linux/Windows asset attack run 43737879129](https://github.com/FlareZ123/obfs/actions/runs/43737879129) at exact `64e81e15245fbd0cc5cf9afc59f5ce3fc6908b65` was **fully green**, covering 9 copied sources versus 9 refusals across build modes, 3 HTTP copies versus 3 SCO handler refusals, focused regression tests, and strict JSDoc typecheck. These counts are per OS.

The earlier focused transform-safety red workflow remains useful negative provenance for two unrelated ESM assignment expectations. Its failure is not a postpatch SVG bypass.
