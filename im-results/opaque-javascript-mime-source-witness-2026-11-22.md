# Executable JavaScript MIME under unrecognized opaque asset suffix

**Agent 32, 22 November 2026. Status: browser-observed negative source-admission evidence; no compiler fix or strong-security claim.**

## Threat boundary

A COO builder receives JavaScript as a declared `sourceType:'asset'` at `javascript/source.blob`. The builder's ordinary JavaScript input `client.js` is eligible for string transformation. A user-controlled static HTTP server separately serves `javascript/index.html` as `text/html` and the opaque resource as `text/javascript`. The HTML document loads it through a classic `<script src="./source.blob">` element. A browser executes the script according to response MIME and request context rather than its file extension.

This is a reproducible deployment contract mismatch, as opposed to a deobfuscator reversing a protected source. The actual JavaScript code was outside the declared JavaScript transformation inventory, so it is distributed publicly in original form. An integrator cannot infer delivery MIME solely from an asset filename or `sourceType` classification.

## Source-pinned execution

The standalone regression is `sims/undeclared-xml-mime-source-witness.js`. It adds two opaque assets alongside the existing prolog-less XML document and eligible ordinary script: a static HTML page, and `javascript/source.blob` whose exact bytes set `data-js-mime-witness` on the document. A local HTTP server supplies the resource as `text/javascript; charset=utf-8`. The script verifies the following independent observations:

- The declared ordinary `client.js` is transformed by the COO compiler, preserving positive obfuscation yield.
- Original JavaScript source bytes, including a unique source canary, remain visible in the opaque `.blob` output.
- Chromium executes the original JavaScript through a real HTTP script request and modifies the observed document attribute.
- Existing prolog-less `application/xhtml+xml` and `application/xml` browser documents both continue executing their HTML-namespace inline source; these are separate MIME cases.

The [full manual Chromium workflow 44977806990](https://github.com/FlareZ123/obfs/actions/runs/44977806990)
**completed success** on source `9c909d6444f07fdd8d2acdc55235c65b053155f9`, including browser integration and strict external JSDoc. Its relevant machine-readable output was:

```json
{
  "compilerAccepted": true,
  "assetExtension": "blob",
  "plainSourceVisible": true,
  "adjacentScriptTransformed": true,
  "browserExecuted": {"xhtml": true, "xml": true},
  "opaqueJavaScriptSourceVisible": true,
  "opaqueJavaScriptExecuted": true
}
```

The [negative witness PR #258](https://github.com/FlareZ123/obfs/pull/258)
merged as `9d8becb59aaf3e51ec24bfad25016da3eef19e1f`.
The XML-only precursor [PR #251](https://github.com/FlareZ123/obfs/pull/251)
merged as `7788bdf2e85b2551cc97b1c9489e0c4b64c5877a`.

## Standards and non-claims

The [WHATWG MIME Sniffing Standard](https://mimesniff.spec.whatwg.org/)
explicitly defines the historical JavaScript MIME essence list and states that
HTTP file extensions are insufficient to determine the supplied MIME.
The [Fetch Standard](https://fetch.spec.whatwg.org/) defines `nosniff` checks
for script and style requests; correct `text/javascript` delivery satisfies
the JavaScript type condition. The negative witness verifies Chromium's
actual response handling under a configured local host, including the
requested MIME types.

This experiment does not show that **SCO's own handler** serves opaque
`.blob` files with executable MIME: the current SCO handler uses a bounded
extension-to-content-type map and defaults unknown suffixes to
`application/octet-stream` with `nosniff`. A third-party reverse proxy
may have independent routing and MIME semantics. The experiment does not
imply general script execution for every browser, deployment, or content
type and supplies no additional tamper resistance, runtime authorization,
or source secrecy.

## Engineering implication

A future opt-in strict publishing boundary should bind reviewed asset
bytes, published resource URLs, media types and source-type classifications
to actual delivery evidence. JavaScript MIME on `sourceType:'asset'` ought
to trigger conservative rejection unless the integrator explicitly
supplies an analyzed/transformed JavaScript source path. XML/HTML/CSS types
need their matching markup/parser/source-map checks even when filename
extensions are unexpected. Independently verified static route metadata
cannot prevent a later hostile proxy from changing HTTP responses.

The concrete proposed contract and validation matrix are in
`workplace/deployment-mime-proof-obligations-2026-11-22.md`.
The primary project's **RELEASE-BLOCKED** decision is unchanged.
