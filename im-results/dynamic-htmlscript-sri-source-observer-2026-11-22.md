# JavaScript-created HTMLScriptElement integrity can pin sibling source bytes

**Status:** Three separately reproduced SRI source-byte defects with source-pinned browser red/green; combined-main Chromium and strict JSDoc passed.
**Modes:** COO, SCO, SNO, with verified no-integrity transformation positive controls.
**Scope:** Common explicit DOM integrity assignments; this is a deliberately bounded compatibility detector.

## Failure mechanism

SRI metadata can be assigned **in JavaScript** before dynamically adding a `<script>` element to a document. An HTML asset that only loads `bootstrap.js` may therefore contain no `integrity` attribute, while `bootstrap.js` creates a new `HTMLScriptElement`, sets its URL, assigns `element.integrity = 'sha256-<hash-of-original-client.js>'`, and appends it to the DOM. The browser rejects a changed `client.js` even when its program behavior without SRI is equivalent.

The compiler already treated static HTML and XHTML SRI metadata as a graph-wide original-source observer. The JavaScript graph source-read analyzer did not recognize runtime integrity setters. It transformed the sibling script's original string representation, violating the browser's SRI fetch contract.

## Source-pinned reproduction

- **Red:** [manual browser workflow 44977660241](https://github.com/FlareZ123/obfs/actions/runs/44977660241), code SHA `57a589d2b1389130919144892e6f5edd558c5966`. Sixteen existing HTML source-byte tests passed; the new COO case failed because the compiler rewrote a dynamically SRI-pinned sibling script.
- **Initial green:** [manual browser workflow 44977800490](https://github.com/FlareZ123/obfs/actions/runs/44977800490), source SHA `0794917341601ee1714522e88d2b01a3d9291a49`, passed all existing browser steps, real Chromium native/protected/unsafe dynamic SRI comparison, and strict JSDoc.
- **Extended green:** [manual browser workflow 44978147150](https://github.com/FlareZ123/obfs/actions/runs/44978147150), source SHA `9bd84430c44a160c0e335836b4da8e6287ab02a3`, passed the full browser workflow including the static/computed `integrity` assignments, `setAttribute`, `setAttributeNS`, `Reflect.set`, and `Object.assign` variants, negative read-only `integrity` control, real Chromium, and strict JSDoc. A separate live SCO handler source-pinning test at SHA `242f40c842bc15e7b18de8c64e6a37217b8acd3b` is also included in this green source.

## Additional source-pinned runtime metadata cases

A `document.write` call can inject a parser-active script containing an `integrity` attribute when the static HTML only loads its bootstrap. [Red 44978432664](https://github.com/FlareZ123/obfs/actions/runs/44978432664), then [green 44978663811](https://github.com/FlareZ123/obfs/actions/runs/44978663811) show source-byte preservation using literal and opaque DOM writes and a separate native/protected/forced-mutation Chrome proof. The source observer follows verified direct, global, and destructured `document` aliases; known harmless literal `document.write('<p>...</p>')` leaves transformation active.

A computed setter key, e.g. `const name=globalThis.k||'integrity'; script[name]=digest`, can pin the script even when the property name is not statically resolvable. [Red 44978985373](https://github.com/FlareZ123/obfs/actions/runs/44978985373) shows rewritten sibling bytes; tracking local `document.createElement('script')` ownership through bindings and aliases, and refusing opaque setter names on known script receivers, restores that case. The complete [green 44979185984](https://github.com/FlareZ123/obfs/actions/runs/44979185984) includes all alias forms, `setAttribute`, `Reflect.set`, `Object.assign`, live SCO response checks and strict JSDoc. The initial scope-placement error at 44979086113 was corrected prior to the green run.

**Combined-main green:** [Chromium workflow 44979545992](https://github.com/FlareZ123/obfs/actions/runs/44979545992) **passed**, and source-coincident [Ubuntu/Windows full validation 44979549012](https://github.com/FlareZ123/obfs/actions/runs/44979549012) **passed**, both at exact executable SHA `1466bd383de0b5d488b8afa4bbf1d6eb9839b9f6`. The latter includes Node22 behavioral/adversarial tests, strict JSDoc, real Chromium on Ubuntu and budget diagnostics. The result is scoped to this source snapshot.

## Repair and proof limits

`observesDistributedSource` in `src/ast.js` now recognizes a bounded set of explicit runtime writers to an `integrity` property or attribute. Since the target script URL may be computed or assigned elsewhere in the group, it opts out of exact-source transforms for the entire supplied graph. This deliberately favors browser parity over transformation yield when a recognized integrity writer is present.

The browser witness `test/dynamic-script-sri-browser.js` serves original, compiled-with-observer, and independently compiled-without-observer variants. Its expected result is: original source loads, observer-protected source loads, byte-mutated counterfactual is rejected by the browser. Node tests supply a no-integrity positive control so a zero-rewrite outcome alone is not mistaken for a successful obfuscator feature.

This detector does not establish a complete solution for all ways to produce SRI metadata: arbitrary runtime code generation, unknown host HTML, proxies, setters constructed from unknown input, and opaque reflection can remain outside a statically proved environment. The inter-file case of a module returning a DOM script to another module's opaque-key setter remains unproved by the current per-file owner analysis; [red cross-file witness 44979643395](https://github.com/FlareZ123/obfs/actions/runs/44979643395) is tracked separately for further research. The new guard is not source secrecy, tamper-resistance against a full-control client, or a universal runtime budget guarantee. The strong-obfuscation release remains **BLOCKED**.

Browser semantics: [HTMLScriptElement.integrity](https://developer.mozilla.org/en-US/docs/Web/API/HTMLScriptElement/integrity), [HTML Standard script processing](https://html.spec.whatwg.org/multipage/scripting.html).
