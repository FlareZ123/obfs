# Browser-observed SVG SMIL generated `javascript:` URLs in otherwise admitted HTML assets

**Researcher:** Agent 32 · **Date:** 28 November 2026 · **Status:** project-specific HTML source-admission bypass reproduced with local Chromium 144 and source-pinned Ubuntu Chrome 158; defensive patch separately pending. This is an intermediate security engineering observation, **not** novel mathematical obfuscation research or release acceptance.

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

Additional **browser-tested HTML entity/control variants** used `<set attributeName="href" to="...">` in the same HTML context, with a safe `href="#safe"` base and a real mouse click: `to="java&#x73;cript:window._witness=71"` produced `href.animVal="javascript:window._witness=71"` and witness **71**; `to="java&#9;script:window._witness=72"` produced an actual tab in `href.animVal` and witness **72**; `to="JaVaScRiPt:window._witness=73"` preserved mixed-case `href.animVal` and witness **73**. These show why raw substring matching is insufficient; the proposed scanner operates on parse5-decoded attributes and the existing `isEmbeddedExecutableUrl` normalization strips ASCII controls and folds ASCII case. This is a narrow code-path inference in addition to the real browser outputs, not a general sanitizer theorem.

These are **observed local browser results**, not generalized across all browsers, CSP policies, or host configurations. The source scanner admission observation is separately backed by the isolated Windows red-team test.

### Secondary hypothesis falsifier

Standalone SVG `<set attributeName="onmouseover" to="window._witness=23" begin="0s" dur="indefinite"/>` is statically admitted by the old SVG scanner, but **did not execute** the synthetic handler in Chromium 144 either as HTML-inline SVG or standalone SVG Blob. Direct `onmouseover` executed and benign `<set attributeName="fill" to="green">` applied. Published [SiYuan SVG SMIL advisory GHSA-5hc8-qmg8-pw27](https://github.com/siyuan-note/siyuan/security/advisories/GHSA-5hc8-qmg8-pw27) documents a related event-target exploit in another context; do **not** infer this exact Chromium payload executes without an independent positive witness. The proposed source guard rejects such targets conservatively across implementations.

## Independently repeated source-pinned browser proof

[Red-team focused validation run 46114019732](https://github.com/FlareZ123/obfs/actions/runs/46114019732) on exact unpatched witness SHA `036bf7741e2300df85acf4745f60a312ccad8ad3` **completed SUCCESS on Ubuntu and Windows**. The Windows job ran static preflight witness and strict JSDoc; Ubuntu additionally ran the *actual browser* witness under **Chrome/158.0.8127.36**. The Ubuntu job log records:

```json
{
  "htmlPreflight": {"direct":"embedded executable URL","animated":null,"values":null},
  "htmlBrowser": {
    "direct":{"before":{"base":"javascript:window._smilHref=51","animated":"javascript:window._smilHref=51"},"after":51},
    "animated":{"before":{"base":"#safe","animated":"javascript:window._smilHref=51"},"after":51},
    "values":{"before":{"base":"#safe","animated":"javascript:window._smilHref=51"},"after":51}
  },
  "chrome":"Chrome/158.0.8127.36"
}
```

This **passes because the original HTML scanner is bypassed**, not because the proposed fix has passed. The same Ubuntu log confirms standalone SVG `onmouseover` direct control executed, benign `fill` animation applied, but `<set attributeName=onmouseover>` did **not** execute; keep that as a possible risk requiring separate host/browser confirmation, not a proven runnable exploit. Chrome 158 now independently corroborates the local Chrome 144 **HTML animated-href executable-URL path**. The Puppeteer browser witness uses `page.setContent` for its HTML scenario, not a fetched `text/html` HTTP response, while a separate direct SVG part of the same run is served over HTTP `image/svg+xml; charset=utf-8` with `nosniff`. Do not claim the *HTML* scenario has an HTTP `nosniff` receipt until a new test makes it.

## Implementation and source-pinned evidence

- Proposed fail-closed guard: **draft [PR #387](https://github.com/FlareZ123/obfs/pull/387)**, head `15a4b0a1dc74c02cc319cf54c32c014d63b25b62`, changes only `src/html-assets.js`, `src/svg-assets.js`, and `test/svg-smil-source-admission-guard.test.js`. It rejects SMIL event-handler attribute targets and potentially executable URL values in HTML-inline SVG; benign `fill` animations remain accepted. Earlier narrower-head two-OS focused run [46113750875](https://github.com/FlareZ123/obfs/actions/runs/46113750875) the latest expanded branch head is `15a4b0a1dc74c02cc319cf54c32c014d63b25b62` and exact-head [focused run 46114454120](https://github.com/FlareZ123/obfs/actions/runs/46114454120) **PASSED 7/7 tests on both Ubuntu and Windows**, including COO/SCO/SNO and SCO publication refusal and safe-byte output controls.
- Unfixed adversarial browser witness branch `agent32/svg-smil-animated-handler-witness-20261128` head `036bf7741e2300df85acf4745f60a312ccad8ad3`. `sims/svg-smil-event-source-witness.js` and `test/svg-smil-event-source.test.js` separate a static false-safe from actual browser `href` execution; focused [46114019732](https://github.com/FlareZ123/obfs/actions/runs/46114019732) **both platforms green, Ubuntu Chrome 158 browser and Windows static evidence confirmed**. **A green adversarial witness is evidence of an old-parser vulnerability, not fix success**.
- Related opt-in MIME staging verification [draft PR #261](https://github.com/FlareZ123/obfs/pull/261) remains independent. It cannot attest unobserved hostile-host responses or global runtime environment locking.
- No runtime obfuscation compute overhead is introduced by these input scanners. Strong static/dynamic source reconstruction resistance, anti-tamper success, authorization/environment locking, 2.5× global overhead, and complete 1:1 behavior remain **not established**; project release **NO-GO**.

## Suggested next evidence

Wait for exact-head browser and cross-OS focused workflow outcomes; if browser proof passes, record exact Chromium version and source receipt. Add explicit COO/SCO/SNO plus `createScoHandler` admission regression and safe-byte-preservation controls. Peer-review SVG foreign-element namespace/case handling; only then consider merge. Never present this narrow guard as an obfuscation-resistance advance.
