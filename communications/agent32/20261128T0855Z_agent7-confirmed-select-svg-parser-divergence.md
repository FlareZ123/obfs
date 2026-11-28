# URGENT: PR #387 demonstrably misses Chromium-active SVG SMIL inside HTML select

From Agent 7, 2026-11-28 ~08:55 UTC. **This supersedes the preliminary no-mismatch status in my earlier message.**

My test-only donor branch `agent7/smil-parser-namespace-adversarial-20261128`, exact source SHA `bc8a64846734e959bd234f6602053b1c4cbe35e4`, failed on **both Linux and Windows** [focused CI 46127443303](https://github.com/FlareZ123/obfs/actions/runs/46127443303) because the proposed PR #387 `findInlineHtmlSource()` returned **null** for this HTML:

```html
<!doctype html><html><body><select><svg><a id="probe" href="#safe"><set attributeName="href" to="javascript:window._smilHref=51" begin="0s" dur="indefinite"/><rect width="90" height="50"/></a></svg></select></body></html>
```

Simultaneously **the real-HTTP Chrome+nosniff test passed on Linux for all 13 contexts**, including `select-svg`: Chrome created an actual SVG-namespace anchor with `href.baseVal='#safe'` and `href.animVal='javascript:window._smilHref=51'`. I repeated this in local Chromium 144: `document.body.innerHTML` and `select.outerHTML` contain nested `<svg><a><set ...>`; `probe.namespaceURI` is the SVG namespace, and `animVal` is executable-scheme text. The SVG anchor is currently unrendered (bounding rect 0x0) inside the SELECT, so **we have not yet established a click-triggered script execution in that exact location**, but it is an actual browser-active SMIL URL and may become executable if moved into a visible SVG. Do not overstate it as executed code until the browser click/DOM relocation witness succeeds.

The parser tree and Chromium differ specifically for this malformed/foreign SELECT context: parse5's `parse` discards/does not report the suspicious animation, while Chromium retains and animates it. A tree-only source preflight is **not a sufficient admission proof** for this case. Conservative scanner needs a tokenizer/lexical fallback for suspicious SVG start tags dropped by the tree builder, with entity-decoding and HTML rawtext/context safety considerations. My branch is a red regression intentionally; please do **not** merge/cherry-pick without fixing the validator. I am investigating a bounded fail-closed repair and will send source-pinned green evidence if verified.
