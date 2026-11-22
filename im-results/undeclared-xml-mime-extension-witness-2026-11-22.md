# Browser executable XML MIME under an opaque extension

**Agent 32, 22 November 2026. Classification: reproducible negative source-admission witness.** The source-byte compatibility protections in `src/html-assets.js` recognized `.html`, `.htm`, `.xhtml`, `.xht`, `.xml`, and SVG files. The compiler could not infer that a separately hosted `sourceType:"asset"` file of a different extension might be delivered with an executable browser XML MIME type.

## Hypothesis and deployment assumptions

A COO build includes an ordinary `client.js` script and a separately declared opaque `index.blob` asset containing XML-syntax HTML-namespace inline JavaScript. The user controls their static HTTP server and configures its content-type for `index.blob` as `application/xhtml+xml` or `application/xml`. The compiler accepts both files without any deployment MIME manifest. The existence of `sourceType:"asset"` does not prove that the file is inert in the browser.

The asset's extension carries no standard browser guarantee about the response MIME. If the file is served as an executable document, a browser can execute the original inline source even though an adjacent eligible JavaScript file was obfuscated normally. This violates a broad assumption that all executable source passed through obfuscation or admission checks, under this explicit deployment arrangement.

## Reproduction

The standalone CommonJS test `sims/undeclared-xml-mime-source-witness.js` builds:
- an ordinary `client.js` source with an eligible string-obfuscation control;
- a binary `index.blob` asset containing an XHTML-namespace `<h:script>` that sets an observable document attribute with original inline-source sentinel;
- an HTTP server mapping `/xhtml/index.blob` to `application/xhtml+xml`, and `/xml/index.blob` to `application/xml`, serving exactly the compiler-emitted asset bytes.

The simulator first asserts that the compiler **transforms** the ordinary JavaScript, **preserves** the `.blob` asset bytes, and leaves the inline sentinel publicly visible. Then it runs Chromium separately under each MIME and verifies actual document-attribute modification from the inline script. It logs a machine-readable JSON record to make conclusions and reproduction observable.

The source-pinned [Chromium workflow 44972046950](https://github.com/FlareZ123/obfs/actions/runs/44972046950), commit `34393fe74bd7a30a88a95e1f9adca05cca5e100c`, printed:

```json
{"compilerAccepted":true,"assetExtension":"blob","plainSourceVisible":true,"adjacentScriptTransformed":true,"browserExecuted":{"xhtml":true,"xml":true}}
```

That workflow's final status was **failure due to unrelated external JSDoc errors** in `sims/jsimplifier-static-attacker.js`; the MIME witness itself completed and passed as intended. A later source-pinned run, with those already independently repaired JSDoc errors merged, is [44972289711](https://github.com/FlareZ123/obfs/actions/runs/44972289711) at `4bf4608a728c8b6deb730f719a9de0599f420c36`. Its final status must be checked before promotion.

## What this establishes

These finite observations establish an **admission/MIME contract gap under a user-configured COO host**. This evidence does not establish that SCO serves unknown extensions as executable XML: SCO uses an explicit MIME map and usually serves unrecognized types as `application/octet-stream`. It does not establish arbitrary content-sniffing behavior in other browsers or all MIME types. It does not imply that any code already distributed to an attacker can be hidden by obfuscation.

A future fix can use an explicitly reviewed per-resource MIME and route manifest, perhaps validated against the actual served headers and protected by content-aware XML/HTML source screening. A conservative unknown-type refusal is another potential policy, but would lower positive transformation yield for harmless fonts, images, localization documents, and binary assets. The tradeoff must be measured rather than assumed. Arbitrary proxies may still change the media type after compilation.

## Related source evidence

- [Agent 30 XML data-URL browser execution](xml-data-url-source-disclosure-2026-11-15.md) established three browser-executable XML MIME forms in explicit data-URL contexts.
- [Declared HTML/XHTML/XML executable-asset protection and SRI](source-resource-integrity-declared-assets-2026-11-22.md) documented corrections for recognized executable extensions. The new witness deliberately uses an **unrecognized** suffix to test the boundary.
- [Source evidence PR #251](https://github.com/FlareZ123/obfs/pull/251) contains the executable simulator and GitHub Actions hook.

**Release interpretation:** Source-admission coverage remains bounded by the declared asset and deployment facts. The project's overarching obfuscator release decision remains **RELEASE-BLOCKED** for independent hostile-runtime security and performance reasons.
