# Browser DOM inline-source observation: property/identifier transform refusal

**Date:** 2026-11-17. **Classification:** Intermediate compatibility investigation. The branch contains a mechanically reproducible browser differential and an unsafe-ablation control; its exact-head CI run was pending when this report was written.

## Semantics and threat boundary

The [HTML Standard](https://html.spec.whatwg.org/multipage/dom.html) defines `Document.currentScript` as the element executing a **classic** script, and `Document.scripts` as a collection of script elements. The [HTMLScriptElement.text](https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement/text) and [textContent](https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement/textContent) attributes expose embedded script text. The [Document.currentScript documentation](https://developer.mozilla.org/en-US/docs/Web/API/Document/currentScript) distinguishes classic execution from modules, where `currentScript` is generally null.

An integrator that embeds transformed `sourceType:'script'` JavaScript inside a page's inline `<script>` can therefore observe its **exact executable source string** without using `fetch`, `XMLHttpRequest`, the Node filesystem, module loaders, or `Function#toString`. The ordinary source observer had no `document` handling before this patch. A transformed local binding can change a source-text comparison even when the numeric function output stays unchanged. This is a browser-embedding compatibility hazard, independent of any security claim about code secrecy.

## Reproduction and decision

The checked-in [real Chromium differential](../test/dom-inline-source-browser.js) embeds one original script, the compiler-emitted version, or a deliberately unsafe low-level identifier-renaming ablation in separate HTML files. Each script computes the same numeric answer, then asks whether the exact embedded source contains the contiguous binding `privateNumber`. The sought observation is:

| Variant | Computed answer | Embedded source contains `privateNumber` |
| --- | ---: | --- |
| Untouched original | 8 | true |
| Emitted, source-observer guard active | 8 | true |
| Unsafe direct identifier-rename ablation | 8 | false |

This is a **test assertion**, not yet a claim about completed CI evidence. The input supplies the marker in the executable identifier spelling, while the runtime lookup concatenates `"private"+"Number"` so the lookup string alone cannot make the source check true. The negative control invokes the project's real low-level renamer, not an invented malformed JavaScript substitute.

The new [source-observer matrix](../test/dom-inline-source-observer.test.js) exercises direct `document.currentScript`, `document.scripts`, `globalThis.document`, `window.document`, direct/derived aliases, destructuring, static/verified computed keys, unresolved computed document keys, and script-selecting DOM queries. A separate [imported-key differential matrix](../test/imported-global-key-proof.test.js) checks benign unrelated imported global keys, static source-capable APIs and dynamic unproved imports. It also insists that unrelated `document.title` remains eligible for function-local identifier renaming. Host locking refuses to inject source-visible wrappers, and a separate ESM observer suppresses cross-file owner-property renaming.

The change lives in [`src/ast.js`](../src/ast.js) inside `observesDistributedSource`. A monotone document-root alias closure handles assignments and global-object references. Source-bearing fields include `currentScript`, `scripts`, and DOM selection calls such as `querySelector('script')` and `getElementsByTagName('script')`; unknown computed fields and dynamic selectors on a proven document root fail closed. This is a static compile-time check and inserts **no additional runtime code**.

## Scope and unresolved issues

This proof covers the exact DOM paths recognized above. It does not exhaust all DOM serialization routes, including `document.documentElement.outerHTML`, arbitrary `getElementById(...)` references to script nodes, dynamic DOM object graphs, delegated host callbacks, modified built-ins or custom HTML elements. External `src` scripts have distinct `HTMLScriptElement.text` behavior, and ESM `document.currentScript` may be null; the conservative guard favors safe refusal over type-of-script specialization. HTML asset publication also has separate constraints on inline script content. No universal behavioral, security, or 2.5× runtime guarantee follows from these finite tests.

**Reproduction command:** `node --test test/dom-inline-source-observer.test.js`, then `node test/dom-inline-source-browser.js` on a machine with Chromium (`CHROMIUM_BIN` configurable). The existing [cross-file reader workflow](../.github/workflows/manual-cross-readers.yml) runs the node checks on Ubuntu/Windows and Chromium on Ubuntu. The original browser-scoped [run 44080979682](https://github.com/FlareZ123/obfs/actions/runs/44080979682) passed its Node tests but failed a **pre-existing brittle computed-refusal ablation anchor** before reaching Chromium or JSDoc. This branch updates that anchor to the refined source guard, and the combined exact-head [run 44081970270](https://github.com/FlareZ123/obfs/actions/runs/44081970270) is pending. Do not report final success until each stage is verified.
