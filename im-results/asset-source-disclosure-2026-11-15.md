# Source-disclosing static assets: paired baseline attack and fail-closed policy

**Status:** intermediate engineering/security evidence, **not** an academically established obfuscation-security result.

**Date:** 2026-11-15. **Author:** Agent 25. **Threat setting:** an attacker can obtain or request every asset that the distribution makes public. No bytecode execution, runtime instrumentation, oracle calls or key recovery is needed for this attack.

## Reproducible pinned experiment

- **Vulnerable baseline:** commit [`5c24cc02066fc27d29fc95d80ea89b005ca9071e`](https://github.com/FlareZ123/obfs/commit/5c24cc02066fc27d29fc95d80ea89b005ca9071e), before asset-output preflight existed.
- **Protected candidate:** commit [`43aae4935fc22b2550b4562d4b02258668f06b4e`](https://github.com/FlareZ123/obfs/commit/43aae4935fc22b2550b4562d4b02258668f06b4e), with `src/source-maps.js`, `src/html-assets.js` and `src/svg-assets.js`.
- **Attacker and assertions:** [`sims/asset-disclosure-attack.js`](../sims/asset-disclosure-attack.js).
- **Cross-platform harness:** [`.github/workflows/manual-asset-attack.yml`](../.github/workflows/manual-asset-attack.yml), manual workflow only, Node.js 22 with independently installed dependencies and two checkouts.
- **Both operating systems green:** [run 43707663173](https://github.com/FlareZ123/obfs/actions/runs/43707663173), which extends the earlier three-asset green [run 43706739931](https://github.com/FlareZ123/obfs/actions/runs/43706739931) with an executable SVG asset. Earlier [run 43706630609](https://github.com/FlareZ123/obfs/actions/runs/43706630609) passed the experiment on Linux but failed to install dependencies on Windows because `npm --prefix` unexpectedly resolved the workspace root. The corrected workflow sets `working-directory` explicitly for each checkout.

The attacker fixture provides `entry.cjs` and four intentionally public assets:

1. `entry.cjs.map`: JSON source map whose `sourcesContent[0]` contains the **exact original** executable program.
2. `index.html`: HTML with `<script>` containing a named private token.
3. `original.jsx`: program source deliberately misclassified as an opaque asset.
4. `icon.svg`: SVG with inline `<script>` containing a private canary.

In the old implementation, `obfuscateFiles` copies all four assets unchanged and an attacker reading the distributed result recovers the private token. For SCO, a live HTTP `GET /obfs/entry.cjs.map` and `GET /obfs/index.html` and `GET /obfs/icon.svg` return the exact original source/map bytes. In the updated implementation, each corresponding build fails its preflight; the SCO handler constructor refuses to publish map, inline-HTML and executable-SVG assets. The target tokens are canaries in a controlled fixture, not claimed production secret disclosures.

| Mode | Baseline assets revealing original content | Updated assets refused | Safe HTML preserved byte-for-byte | Executable JS unaffected when adding safe HTML |
| --- | ---: | ---: | --- | --- |
| COO | 4 of 4 | 4 of 4 | yes | yes |
| SCO | 4 of 4 | 4 of 4 | yes | yes |
| SNO | 4 of 4 | 4 of 4 | yes | yes |

The original leakage is a **static reconstruction shortcut**: recovered `sourcesContent` already contains the original program, making the obfuscated output irrelevant. The protected build refuses the ambiguous distribution instead of deleting source-bearing content or silently breaking an HTML page.

## Policy and compatibility contract

The preflight runs on every group passed to `obfuscateFiles`, plus files explicitly served by programmatic `createScoHandler`.

- Case-insensitive `.map` asset suffixes are prohibited.
- Acorn parses JavaScript comments to detect genuine `sourceMappingURL` annotations, including inline `data:` forms, without mistaking string/template/regex literals for comments.
- Opaque assets with executable and transpiler-input extensions (`.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`, `.vue`, `.svelte`, `.astro`, `.mdx`, `.coffee`, `.litcoffee`) are refused, because they would bypass every JavaScript transformation.
- HTML and HTM assets are parsed with pinned `parse5@7.3.0` using browser-compatible HTML5 parsing. The preflight refuses inline script bodies, event handler attributes, `iframe srcdoc`, executable `javascript:` and `data:` URL contexts, including HTML character-reference spellings and nested templates. External script references remain permitted. The original safe HTML bytes are retained. A strict UTF-8 decoder rejects malformed byte sequences and NUL-padded UTF-16-like markup.
- SVG source is parsed by pinned `saxes@6.0.0` under XML namespace rules. Inline `<script>`, event handlers, executable URI attributes, DTDs, malformed XML and mismatched XML declarations are refused; inert vector geometry, raster-image references and static links remain byte-identical.

The general-suite and focused-suite regressions live in [`test/source-map-disclosure.test.js`](../test/source-map-disclosure.test.js) [`test/html-asset-disclosure.test.js`](../test/html-asset-disclosure.test.js), and [`test/svg-asset-disclosure.test.js`](../test/svg-asset-disclosure.test.js). The HTML parser handles syntax parsing, whereas the supported execution context set is an explicitly bounded security policy.

## Independent evaluation against requested criteria

| Criterion | Observed effect and limit |
| --- | --- |
| Static reconstruction | Exact original-source sidecars no longer ship through the four tested channels; other arbitrary source-bearing assets remain in scope |
| Dynamic analysis and extraction | No new resistance. The attacker still controls public JS and can instrument or extract it |
| Unauthorized modification | No new trusted integrity anchor; this is a build/serve refusal check |
| Execution outside authorized environment | No new enforcement; browser host locking and SNO local hashes retain prior threat limitations |
| Runtime performance | The guard adds no instructions to distributed JS and safe HTML bytes are identical; cold build preflight adds parsing work, and universal 2.5× runtime compliance is not established by these cases |
| Compatibility | Deliberate build-time refusal of files that used to be distributed unchanged. Safe HTML containing normal external script links continues to work |

This improves the confidentiality of *distributions* where original source would otherwise be accidentally published. It does **not** establish strong unreadability of delivered code under COO, server-owner integrity in SNO, or functional secrecy of SCO operations under unlimited chosen-input access.

## Remaining failure modes and next falsification directions

- Arbitrary JSON, text, compressed SVGZ, XML other than SVG, CSS, and binary containers may embed source outside recognized suffixes and parsed execution contexts; there is no general proof that a published asset has no private code.
- HTML/SVG with invalid UTF-8, explicit UTF-16-style NUL padding or unsupported SVG encoding declarations is rejected. Other transport-level character-set overrides or browser parsing discrepancies remain an important deployment risk. Integrators should serve audited HTML/SVG consistently as UTF-8.
- Independently hosted or third-party script links are outside the module-graph proof. An HTML `<script src>` reference is accepted on the assumption that its target is an intentionally published, properly obfuscated resource. Validate deployment's actual asset manifest against the complete intended output graph.
- A client that can execute code can still reconstruct or bypass the public transforms. Treat the source-disclosure audit as an additional release gate rather than a substitute for better transformations.

**Decision:** retain the narrowly specified preflight as defensive correctness. Continue independently measured attacker-resistance research; do not promote this maintenance-grade result to `results/`.
