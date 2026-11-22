# HTML Subresource Integrity pins externally served JavaScript bytes

**Agent 7, 22 November 2026.** Research status: intermediate behavioral compatibility correction. This note establishes a finite, observable browser-integrity contract and its associated bounded compiler refusal. It does not establish new confidentiality, anti-analysis, authorized-environment enforcement, or the requested 2.5× performance budget.

## Failure mode

HTML [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity) allows an external `<script src="./client.js" integrity="sha256-...">` to pin the exact decoded JavaScript response bytes, as a base64-encoded SHA-256 digest. The browser rejects a response whose bytes do not match its HTML integrity metadata. The checked HTML file is passed as an ordinary untouched `sourceType:"asset"` input, while `client.js` is separately obfuscated. Even a fully behavior-preserving source rewrite therefore changes whether the script executes. The same problem applies to the SCO HTTP handler's per-request nonsemantic literal-spelling variation.

This observation is a **browser fetch security boundary**, distinct from `Function.prototype.toString` or an explicit source-file read. A browser may enforce it without any same-origin script examining source bytes or program values.

## Falsifiable pre-fix and real-browser evidence

New tests added to `test/html-asset-disclosure.test.js` first asserted that an HTML asset with matching declared JavaScript SRI must keep the published response byte-exact in each of COO/SCO/SNO. A second test asserted two SCO HTTP fetches of the SRI-pinned script return its original bytes. A third, unrelated external CDN integrity positive asserted the compiler still transforms an eligible local standalone script.

At source `e70f6ca4766a5624be31a1e526662f29ada9cc40`, before any SRI-aware compiler change, the existing Chromium CI [run 44965045486](https://github.com/FlareZ123/obfs/actions/runs/44965045486) failed exactly **two newly added negative tests** (the script source pin and SCO HTTP publication), while the unrelated external SRI positive passed.

The standalone real-browser witness in `test/html-sri-browser.js` starts one HTTP server serving the same original SRI-bearing HTML under three prefix routes, with three alternative served JavaScript bodies. Chrome runs each route in a fresh headless process and checks whether the script's `document.documentElement.dataset.sri="loaded"` side effect actually occurred:

- **Native:** original source file, 112 bytes, matching HTML SRI, script executed.
- **Safe complete graph:** compiler sees `index.html` and `client.js`, preserves source, SRI matches, script executed.
- **Unsafe counterfactual:** independently compile `client.js` without its HTML asset, leaving HTML unchanged. Its generated string decoder increases the script response to 649 bytes, so Chrome rejects it: the side effect is absent.

The normal program value is unchanged for the counterfactual JavaScript if executed without SRI; the browser refuses to execute that changed source. Real Chrome produced `SRI_BROWSER {"nativeLoaded":true,"safeLoaded":true,"unsafeBlocked":true,"nativeBytes":112,"unsafeBytes":649}` in [pinned run 44965200648](https://github.com/FlareZ123/obfs/actions/runs/44965200648), source `852be67eaf56e96ee70e82e6d15fbacaa298fb63`.

## Conservative correction

`src/html-assets.js` now includes `hasPinnedLocalJavaScriptIntegrity(files)`. It uses the existing parse5 HTML5 parser and the declared JavaScript path inventory; it recognizes SRI-bearing `<script src>`, `<link rel="modulepreload" href>`, and `<link rel="preload" as="script" href>` elements whose normalized URL pathname matches a supplied JavaScript file. Resolution handles a declared HTML base href, `./` and `../`, rooted URLs, percent-encoded path letters, query strings and fragments. An absolute origin bearing a declared target path is conservatively treated as source-pinning because the deployment's actual host is not available to this compiler.

The standard compiler ORs this witness into its group-wide source-observation refusal. The SCO HTTP publisher ORs it into the same group-wide decision before doing its randomized per-request spelling variation. This preserves exact output bytes, or refuses explicit host guards that would change source while retaining SRI. The original HTML assets remain byte-exact. An external integrity entry with a different resource path does not disable eligible local transformations.

The checker performs a finite declared-source scan; undeclared HTML, host-injected markup, server-side URL rewrites, unusual media-type routing, redirects, unknown deployment origins, proxy-normalization rules and response-header integrity policies are outside its proven compatibility envelope. The conservative whole-group decision can over-refuse, and no promise is made about general obfuscation when original JS source bytes are committed by external integrity metadata.

## Reproduction and release interpretation

- Run `node --test test/html-asset-disclosure.test.js` with the repository's declared dependencies and Node 22.
- On a machine with real Chrome, run `node test/html-sri-browser.js`; `CHROMIUM_BIN` selects the Chrome executable if needed.
- The existing `.github/workflows/manual-browser.yml` executes both probes and strict JSDoc; no new workflow was created.
- Source-pinned Ubuntu/Windows regression details should be attached when the complete branch validation finishes.

This correction improves baseline browser behavior preservation. It does not make the protected source harder to recover. The repository's strong-protection release status remains **RELEASE-BLOCKED**.
