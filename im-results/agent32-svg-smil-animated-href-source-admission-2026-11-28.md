# Browser-observed SVG SMIL generated `javascript:` URLs in otherwise admitted HTML assets

**Researcher:** Agent 32 · **Date:** 28 November 2026 · **Status:** project-specific source-audit defect with local Chromium proof; separate source-pinned CI in progress. This is an intermediate security engineering observation, **not** novel mathematical obfuscation research or release acceptance.

## Primary project-specific discrepancy

Current-main `src/html-assets.js` parses HTML using `parse5`. `findInlineHtmlSource` rejects a literal `href="javascript:..."` on any element, but visits foreign SVG children without interpreting the SMIL animation value attributes `to`, `from`, `by`, and `values`. Consequently an opaque `.html` input can embed a live script-bearing URL in an SVG animation even when every original `href` value is safe, and the original opaque asset is otherwise copied rather than obfuscated. A corresponding `<set attributeName="href" to="javascript:...">` in the standalone `src/svg-assets.js` scanner was **already** rejected because the SVG scanner checks `to` and `values`; the gap is specifically HTML-inline SVG admission. Existing XHTML/XML checks also screen `to` and `values`.

### Local native Chromium reproduction (independent of compiler)

Playwright Python sync API, Debian Linux Chromium **144.0.7559.96**, browser executable `/usr/bin/chromium`, `headless=True`, `--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`. A local test ran in `about:blank` using `page.set_content` (real HTML document, not fetched HTTP) and separately `Blob(...,{type:'image/svg+xml'})` top-level SVG navigation. External HTTP navigation was blocked by the runtime's administrator policy, so **this local experiment does not establish HTTP MIME or `nosniff` behavior**.

HTML document example (here `window._witness=51` is a harmless execution marker):

```html
<!doctype html><html><body>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="96">
  <a id="go" href="#safe">
    <set attributeName="href" to="javascript:window._witness=51"
         begin="0s" dur="indefinite" fill="freeze"/>
    <rect width="100" height="80" fill="red"/>
  </a>
</svg></body></html>
```

After a 1.4-second hold, the DOM link had **`href.baseVal='#safe'`** while **`href.animVal='javascript:window._witness=51'`**. A real Playwright mouse click at (30,30) set `window._witness` to **51**. A direct literal `href="javascript:..."` positive control also set 51. Replacing the `set` with `<animate attributeName="href" values="javascript:window._witness=51" begin="0s" dur="indefinite" fill="freeze"/>` or `values="#safe;javascript:window._witness=51" begin="0s" dur="1s" calcMode="discrete" fill="freeze"` likewise set 51. The same semantics occurred in a top-level Blob SVG of `image/svg+xml` and in XHTML `application/xhtml+xml`; the existing standalone/XML scanners already screen URL-bearing animation values.

These are **observed local browser results**, not generalized across all browsers, CSP policies, or host configurations. The source scanner admission observation is separately backed by the isolated Windows red-team test.

### Secondary hypothesis falsifier

Standalone SVG `<set attributeName="onmouseover" to="window._witness=23" begin="0s" dur="indefinite"/>` is statically admitted by the old SVG scanner, but **did not execute** the synthetic handler in Chromium 144 either as HTML-inline SVG or standalone SVG Blob. Direct `onmouseover` executed and benign `<set attributeName="fill" to="green">` applied. Published [SiYuan SVG SMIL advisory GHSA-5hc8-qmg8-pw27](https://github.com/siyuan-note/siyuan/security/advisories/GHSA-5hc8-qmg8-pw27) documents a related event-target exploit in another context; do **not** infer this exact Chromium payload executes without an independent positive witness. The proposed source guard rejects such targets conservatively across implementations.

## Implementation and source-pinned evidence

- Proposed fail-closed guard: **draft [PR #387](https://github.com/FlareZ123/obfs/pull/387)**, head `49cd9cb7b98c6e8824ea8ada7d042ae9c12be009`, changes only `src/html-assets.js`, `src/svg-assets.js`, and `test/svg-smil-source-admission-guard.test.js`. It rejects SMIL event-handler attribute targets and potentially executable URL values in HTML-inline SVG; benign `fill` animations remain accepted. Exact-head two-OS focused run [46113750875](https://github.com/FlareZ123/obfs/actions/runs/46113750875) Windows passed, Ubuntu pending as of this note.
- Unfixed adversarial browser witness branch `agent32/svg-smil-animated-handler-witness-20261128` head `036bf7741e2300df85acf4745f60a312ccad8ad3`. `sims/svg-smil-event-source-witness.js` and `test/svg-smil-event-source.test.js` separate a static false-safe from actual browser `href` execution; focused [46114019732](https://github.com/FlareZ123/obfs/actions/runs/46114019732) Windows static green, Ubuntu browser pending. **A green adversarial witness is evidence of an old-parser vulnerability, not fix success**.
- Related opt-in MIME staging verification [draft PR #261](https://github.com/FlareZ123/obfs/pull/261) remains independent. It cannot attest unobserved hostile-host responses or global runtime environment locking.
- No runtime obfuscation compute overhead is introduced by these input scanners. Strong static/dynamic source reconstruction resistance, anti-tamper success, authorization/environment locking, 2.5× global overhead, and complete 1:1 behavior remain **not established**; project release **NO-GO**.

## Suggested next evidence

Wait for exact-head browser and cross-OS focused workflow outcomes; if browser proof passes, record exact Chromium version and source receipt. Add explicit COO/SCO/SNO plus `createScoHandler` admission regression and safe-byte-preservation controls. Peer-review SVG foreign-element namespace/case handling; only then consider merge. Never present this narrow guard as an obfuscation-resistance advance.
