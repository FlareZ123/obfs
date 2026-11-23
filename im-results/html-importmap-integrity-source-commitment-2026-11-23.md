# HTML import-map integrity: bounded safe admission and module-byte preservation

**23 November 2026, Agent 7. Intermediate semantic-compatibility result.**
This changes the compiler's accepted opaque HTML subset and protects
specific browser-imported module bytes. It is not evidence of strong
confidentiality, client anti-tamper security, or a universal 2.5× runtime bound.

## Browser rule and previous gap

The [WHATWG HTML import-map processing model](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)
and [MDN's importmap reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap)
allow inline `<script type="importmap">` JSON to specify a module URL's
`integrity` metadata. This applies to a dependency imported by an ordinary
module, even when no `<script src integrity>` tag pins the dependency.

Previously, `src/html-assets.js::findInlineHtmlSource` rejected every
non-whitespace `script` body, including safe import-map JSON. The
compiler therefore could not publish a documented browser module
configuration with only ordinary HTTP(S) URLs and an import-map integrity
manifest. Silently allowing such HTML without recognizing its integrity
metadata would risk publishing byte-mutated JS that Chrome refuses to load.

## Red-first and corrected source pins

- **Pre-change source** `5e5df127afe2a7d35b18fe65fa057589d7c15197`,
  [focused Node run 45279494327](https://github.com/FlareZ123/obfs/actions/runs/45279494327):
  both Ubuntu and Windows failed three new admissible import-map checks with
  `inline script source`, as expected. The embedded-`data:` refusal control
  already passed.
- **Compiler correction** `2390c930f6ebb4bb1f1a8132a1705a82dd0d5e3c`,
  [focused run 45279816689](https://github.com/FlareZ123/obfs/actions/runs/45279816689):
  both OS green, all focused strict JSDoc gates green.
- Added SCO HTTP repeated-fetch and malformed integrity text negatives,
  source `5b1766739e8c79a5fa793f8a10e432557551cbdd`,
  [focused run 45280203581](https://github.com/FlareZ123/obfs/actions/runs/45280203581):
  both OS green.
- Restricted JSON import specifier names to conservative URL-like tokens and
  added a literal `function leaked(){...}` specifier refusal, source
  `ff30cd1d3ffcd5e78570c26844c6197173f4c1df`,
  [focused run 45280458035](https://github.com/FlareZ123/obfs/actions/runs/45280458035):
  both OS green.
- Strictly including the two new tests under `jsconfig.external.json`
  exposed one unannotated `response` inference (TS7022), red
  [run 45280887891](https://github.com/FlareZ123/obfs/actions/runs/45280887891).
  Added an explicit `globalThis.Response` JSDoc, then
  **source `c2b77c0c03efd31ca93c63ddd20eee8d51a36c0c`**
  [focused run 45281119322](https://github.com/FlareZ123/obfs/actions/runs/45281119322)
  passed both OS, complete focused test and all configured strict JSDoc gates.
- [PR #364](https://github.com/FlareZ123/obfs/pull/364)
  merged as `40a7dec9e8a9fc67dfea4c62c56a8f0ba80870b4`.
  Subsequent commits between executable CI and merge were docs changes
  only. The merged source is verified by GitHub PR merge receipt.

## Production and test boundaries

A new `safeHtmlImportMap` function narrowly recognizes only ordinary
HTML `script[type=importmap]` JSON configuration with top-level
`imports`, `scopes` and/or `integrity`. It checks HTTP(S)/relative URL
values, conservative module specifier names, and canonical SHA-256/384/512
digest metadata; malformed maps, unsupported protocols, executable
`data:`/`javascript:` URLs and raw code-like names are refused. General
non-importmap JSON scripts and XHTML script text still retain the prior
source-audit refusal.

The existing `hasPinnedLocalJavaScriptIntegrity` then reads validated
import-map `integrity` keys, resolves document/base/route-prefix paths and
checks original JS source hash commitments for unknown public mounts.
A local pin vetoes transforms so the browser sees matching bytes.
Positive controls require real transform yield with safe unpinned and
unrelated-relative metadata. A SCO handler with a custom
`/custom/` route prefix repeatedly served exact pinned module bytes.
The compiler's production transformation passes themselves were unchanged.

## Real browser three-way differential

`test/html-importmap-integrity-browser.js` starts an actual HTTP server and
feeds native, correctly admission-guarded, and deliberately transformed-without-
the-HTML module variants to separate headless Chromium navigations. The HTML
has no `script[src].integrity`; the SRI metadata is **only** in import-map
JSON. It loads a bare `library` specifier mapped to the locally served
`library.mjs`, which the module imports.

The assertions require **native imported module loaded**, **guarded compiled
module loaded**, and **counterfactual byte-mutated module rejected**.
All three passed in the dedicated import-map step in:
- [Chromium run 45280043721](https://github.com/FlareZ123/obfs/actions/runs/45280043721),
  source `6b535ab15ea330450ea728ad7f2d9a7ea7662947`;
- [Chromium run 45280615969](https://github.com/FlareZ123/obfs/actions/runs/45280615969),
  source `ff30cd1d3ffcd5e78570c26844c6197173f4c1df`
  with the final executable import-specifier constraint.

Both whole Chromium workflows were **red at an unrelated existing
`bound-runtime-interception-browser.js` step**. The passing import-map
step therefore supports its narrowly defined outcome only, not a green
complete-browser release receipt.

## Limits and follow-up

The parser deliberately does not admit the full browser import-map grammar,
arbitrary inline JSON bodies, unsupported URL protocols, XHTML maps, dynamic
DOM-injected maps, worker imports, undecidable deployment rewriting,
server-provided replacement manifests or arbitrary source-bearing strings.
Like other SRI handling it can sacrifice obfuscation yield to preserve
source-byte parity. This is a compatibility improvement, not stronger
resistance to instrumented execution. Every strong security/performance
release claim remains **RELEASE-BLOCKED**. Test the accepted mapping subset
against future browser standards and reassess only with real browser evidence.
