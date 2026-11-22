# Foreign SVG `base` can hide a live HTML SRI source-byte dependency

**Status:** Reproduced compiler compatibility failure, corrected on a review branch.
**Mode:** COO, SCO, and SNO source publication checks.
**Scope:** Static HTML source-byte observation and live Chromium SRI parity.

## Failure mechanism

The original `hasPinnedLocalJavaScriptIntegrity` in `src/html-assets.js` searched the parse5 document for the first element whose `tagName==='base'`. It did not check the element namespace. The browser's HTML document base URL depends on HTML `base` elements, whereas an SVG-namespace `base` element is not an `HTMLBaseElement`.

The minimum witness publishes `assets/client.js` together with `pages/index.html`. The HTML document contains, in this order:

```html
<svg><base href="../unrelated/"/></svg>
<base href="../assets/">
<script src="./client.js" integrity="sha256-<digest-of-original-client.js>"></script>
```

The original analysis took the SVG element's unrelated base URL. It checked `/pages/client.js` and `/unrelated/client.js` instead of the browser's SRI-pinned `/assets/client.js`. The compiler rewrote the local script's string representation. The browser therefore rejected the SRI check and suppressed its execution. This is a source-byte compatibility failure even when the rewritten JavaScript computes the same values.

## Paired evidence

The new `test/html-asset-disclosure.test.js` case includes a no-SRI positive control that demonstrates the same script really does transform. It requires byte-exact retention in all three compilation modes with the SRI document present.

- **Pre-fix:** [Manual browser workflow 44976184397](https://github.com/FlareZ123/obfs/actions/runs/44976184397), source `0b30ad93f39a4321c326419c631144d108947fb1`. 15 existing HTML asset tests passed; the new source-byte assertion failed for COO because the compiler emitted its XOR string decoder instead of the original script.
- **Fix:** The first-active-base selection now requires `node.namespaceURI==='http://www.w3.org/1999/xhtml'`. This excludes foreign SVG/MathML base impostors while preserving the existing document-base fallback and inert template exclusion.
- **Targeted post-fix evidence:** [Manual browser workflow 44976269294](https://github.com/FlareZ123/obfs/actions/runs/44976269294), executable-source SHA `e8c3ded14767cadf1b8519d3a00eacf3cc2dabfd`. The HTML source-byte regression and independent native/protected/forced-mutation Chromium comparisons both passed their initial workflow steps. The dedicated browser harness asserts that the native and protected scripts execute, while the separately mutated counterfactual is rejected.
- **Further validation:** [Two-platform manual validation 44976358490](https://github.com/FlareZ123/obfs/actions/runs/44976358490) was in progress when this record was first created. Treat subsequent source changes separately from these pinned runs.

The browser reproducer is `test/html-sri-foreign-base-browser.js`; the standard browser workflow gates it. The compiler test and real browser test are independent entry points.

## Limits and interpretation

This patch repairs one concrete URL-resolution misproof. It does not prove that every HTML integration point, dynamic base update, unknown deployment route, or cross-origin runtime can be modeled by the static compiler. The static observer deliberately opts out of source transformation when observed bytes could be pinned; this yields original distributed JavaScript rather than protecting its confidentiality.

There is no strengthened claim about hostile-client authorization, generic reverse engineering, SNO hostile-owner integrity, or the universal 2.5× compute budget. The project's strong-protection release remains blocked.

## Supporting standards and implementation

The HTML `base` element's scope and first-`href` semantics are summarized at [MDN's HTML base element reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/base). parse5's default tree exposes element namespace identity through [the tree-adapter API](https://parse5.js.org/interfaces/parse5.TreeAdapter.html).

The patch and review discussion are in [PR #254](https://github.com/FlareZ123/obfs/pull/254).
