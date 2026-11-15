# XML document data-URL source disclosure and browser execution (Agent 30, 2026-11-15)

## Question

The distributed opaque-asset preflight recognized `data:text/html`, `data:image/svg+xml`, and JavaScript media types in URL-bearing HTML/SVG attributes, but omitted three browser-document XML media types: `application/xhtml+xml`, `application/xml` and `text/xml`. The [HTML Standard XML syntax](https://html.spec.whatwg.org/multipage/xhtml.html) permits HTML-namespace script elements inside XML documents; its [introduction](https://html.spec.whatwg.org/multipage/introduction.html) specifically identifies `application/xhtml+xml` as a browser-parsed XML syntax. These media types could disclose original JavaScript carried in a URL inside an otherwise copied, untransformed asset.

## Reproduction at exact source SHA

Candidate commit **`b09b9a14f65992c1eb13500f5458eb8bd9c02c34`** on research branch `agent30-xml-url-audit` was evaluated on Linux and Windows without per-commit CI.

1. [Real Chromium run 43718295358](https://github.com/FlareZ123/obfs/actions/runs/43718295358) passed. `sims/xml-data-url-browser.js` served a page with a `data:` iframe carrying the same XHTML-namespace `<script>` for each MIME. Inside that iframe, the script sent `postMessage` to the HTTP-origin parent; the parent visibly changed `#answer` to `executed`. Chromium printed **three successful execution observations**: `application/xhtml+xml`, `application/xml` and `text/xml`. This establishes execution for those exact browser input shapes, not a universal execution property of arbitrary XML or of image-only SVG contexts.
2. [Paired asset extraction run 43718298891](https://github.com/FlareZ123/obfs/actions/runs/43718298891) passed Ubuntu and Windows. The protected compiler refused all **9/9** sampled source-bearing opaque asset distributions in **each** SCO, COO and SNO lane, while the pinned historical baseline `5c24cc02066fc27d29fc95d80ea89b005ca9071e` published all **9/9**. The additional ninth specimen was an HTML `iframe src="data:application/xhtml+xml,..."` carrying a source canary. Real SCO HTTP checks recovered source in **8/8** historical published assets and verified their protected counterparts were refused.
3. The browser workflow also passed the existing live integration fixtures and strict JSDoc check, and the paired attack retained benign HTML byte-preservation and unchanged executable-file comparisons.

## Change

The `isEmbeddedExecutableUrl` predicate in `src/html-assets.js` now includes XML-document data-URL media types `application/xhtml+xml`, `application/xml`, and `text/xml`. The shared predicate covers HTML URL attributes, SVG link and animation attributes, and the previously fixed `meta refresh` target detection. The HTML/SVG source-disclosure tests cover those exact MIME forms, while preserving harmless `data:image/png` and `data:application/json` URLs.

## Scope, threat, limits

This closes **three specific MIME gaps in a build-time source-publishing refusal**. It does not hide distributed obfuscated JavaScript, constrain an attacker-controlled browser/Node runtime, validate arbitrary XML media types or embedded source in CSS/JSON, or prove a general no-disclosure policy. The adversary in the paired attack only reads source assets. The earlier historical baseline differs from the immediate prepatch head, so its 9/9 comparison is evidence for the protected policy and the source-readable control, not an isolated before/after effect size solely for the three newly added media types.

The browser execution probe is a concrete improvement in evidence over a syntax-only conjecture. The isolated source-code guard has no work on the obfuscated program's runtime hot path. The paired simulator's tiny build timings are not a 2.5× application performance benchmark. The project still needs cross-browser, XML-namespace and media-type compatibility investigation before claiming exhaustive source-disclosure prevention.
