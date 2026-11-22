# HTML SRI original bytes under URL-encoded document filenames

**Status:** Reproduced with a source-pinned negative control; conservative compiler fix and real Chromium parity fixture under review.
**Affected modes:** COO/SNO/SCO source-byte preservation.
**Scope:** Static path-to-URL translation, not source secrecy.

## Mechanism

The compiler represents each published asset by a validated **filesystem-relative path**, which may include a literal `#` or `%` character. The HTML SRI target resolver had constructed a `URL` using `new URL('/'+filename,origin)`. When `filename` contains `#`, WHATWG URL parsing treats the rest as a fragment, truncating the actual document path. Relative SRI target resolution then starts from the wrong directory, so the compiler fails to identify an original JavaScript source whose bytes the browser requires.

For example, the published files are:

```text
pages/hash#inside/index.html
pages/client.js
```

The page declares `<script src="../client.js" integrity="sha256-<original-digest>"></script>`. The browser requests its HTML as `/pages/hash%23inside/index.html`, resolving the script to `/pages/client.js`. The compiler's unescaped pathname became `/pages/hash` with a fragment `#inside/index.html`, resolving the same reference to `/client.js`. Without observing `pages/client.js`, the obfuscator emitted a modified string decoder and broke Subresource Integrity.

## Paired evidence

- **Red:** [workflow 44976876670](https://github.com/FlareZ123/obfs/actions/runs/44976876670) at `94dea15c12bb840bb7bc8fa9b5fb6995ab5bbbd8`. Fifteen pre-existing HTML tests passed; the new source-byte fixture failed because COO rewrote the `pages/client.js` source. The test independently establishes a positive transformation when SRI is removed.
- **Fix:** construct the document base using `filename.split('/').map(encodeURIComponent).join('/')`, preserving actual path separators while escaping every filesystem segment as URL data. Apply this to the HTML and XHTML/XML SRI readers; let the ordinary WHATWG URL parser resolve relative script references after this translation.
- **Green:** [manual browser workflow 44976967924](https://github.com/FlareZ123/obfs/actions/runs/44976967924) (candidate SHA `9d642fbaf2a2609001f8b2614e0e53bbd871811b`) includes the same three-mode regression and a separate real-Chromium native/protected/intentionally-mutated fixture. Record completed status separately when verified.
- **Full validation:** pending an exact-source Linux/Windows gate; do not extrapolate from focused Chromium.

## Reproduction

Use `node --test test/html-asset-disclosure.test.js` for the three-mode positive/negative source-byte test. With Chromium installed, run `node test/html-sri-filename-browser.js`. The browser harness mounts three publication variants under one HTTP server and visits a percent-encoded `hash%23inside` directory. Expected observation: original script loads, protected script loads, and intentionally modified script fails browser SRI.

## Limits

The change refines a proven source-observation guard. It cannot keep public JavaScript confidential, prevent a full-control debugger from reconstructing code, enforce authorized host execution, or guarantee a universal 2.5× performance bound. The original source is deliberately retained where an SRI commitment requires it. Absolute deployment URLs, dynamically generated HTML, request rewrites, and unknown publish-path aliases still require their own proof. The project release remains **BLOCKED** for the primary strong-protection objective.

Reference: [WHATWG URL Standard](https://url.spec.whatwg.org/) for fragment parsing and percent-encoded path components.
