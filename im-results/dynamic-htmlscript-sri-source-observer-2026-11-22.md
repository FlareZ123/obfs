# JavaScript-created HTMLScriptElement integrity can pin sibling source bytes

**Status:** Reproduced browser-source mutation and source-pinned red/green conservative source-observer repair.
**Modes:** COO, SCO, SNO, with verified no-integrity transformation positive controls.
**Scope:** Common explicit DOM integrity assignments; this is a deliberately bounded compatibility detector.

## Failure mechanism

SRI metadata can be assigned **in JavaScript** before dynamically adding a `<script>` element to a document. An HTML asset that only loads `bootstrap.js` may therefore contain no `integrity` attribute, while `bootstrap.js` creates a new `HTMLScriptElement`, sets its URL, assigns `element.integrity = 'sha256-<hash-of-original-client.js>'`, and appends it to the DOM. The browser rejects a changed `client.js` even when its program behavior without SRI is equivalent.

The compiler already treated static HTML and XHTML SRI metadata as a graph-wide original-source observer. The JavaScript graph source-read analyzer did not recognize runtime integrity setters. It transformed the sibling script's original string representation, violating the browser's SRI fetch contract.

## Source-pinned reproduction

- **Red:** [manual browser workflow 44977660241](https://github.com/FlareZ123/obfs/actions/runs/44977660241), code SHA `57a589d2b1389130919144892e6f5edd558c5966`. Sixteen existing HTML source-byte tests passed; the new COO case failed because the compiler rewrote a dynamically SRI-pinned sibling script.
- **Initial green:** [manual browser workflow 44977800490](https://github.com/FlareZ123/obfs/actions/runs/44977800490), source SHA `0794917341601ee1714522e88d2b01a3d9291a49`, passed all existing browser steps, real Chromium native/protected/unsafe dynamic SRI comparison, and strict JSDoc.
- **Extended candidate:** additional Node cases for static and computed `integrity` assignments, `setAttribute`, `setAttributeNS`, `Reflect.set`, and `Object.assign` plus a negative test proving an unrelated read-only `integrity` data field still permits actual script rewriting. Later source-pinned workflow result required before any green claim for the extended surface.

## Repair and proof limits

`observesDistributedSource` in `src/ast.js` now recognizes a bounded set of explicit runtime writers to an `integrity` property or attribute. Since the target script URL may be computed or assigned elsewhere in the group, it opts out of exact-source transforms for the entire supplied graph. This deliberately favors browser parity over transformation yield when a recognized integrity writer is present.

The browser witness `test/dynamic-script-sri-browser.js` serves original, compiled-with-observer, and independently compiled-without-observer variants. Its expected result is: original source loads, observer-protected source loads, byte-mutated counterfactual is rejected by the browser. Node tests supply a no-integrity positive control so a zero-rewrite outcome alone is not mistaken for a successful obfuscator feature.

This detector does not establish a complete solution for all ways to produce SRI metadata: arbitrary runtime code generation, unknown host HTML, `document.write` with computed strings, proxies, setters constructed from unknown input, and opaque reflection can remain outside a statically proved environment. The new guard is not source secrecy, tamper-resistance against a full-control client, or a universal runtime budget guarantee. The strong-obfuscation release remains **BLOCKED**.

Browser semantics: [HTMLScriptElement.integrity](https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement/integrity), [HTML Standard script processing](https://html.spec.whatwg.org/multipage/scripting.html).
