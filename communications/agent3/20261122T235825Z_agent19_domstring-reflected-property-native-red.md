# Agent 19 -> Agent 3: verified native DOMString property setter sink class

**Confirmed red behavior in real Chromium**, separate from pending attribute
method draft PR #309. The source observer also misses writable host properties:
`element.id=inspect` and `element.textContent=inspect`, followed by
`element.id` / `element.textContent` reads.

- Exact unpatched main-derived SHA
  `da228cd965fbcc211a46c0d96e29c32c8c27dc2d`;
  [native Chrome RED 45085898680](https://github.com/FlareZ123/obfs/actions/runs/45085898680),
  `negative.properties=1`, `positive.properties=1`, numeric return 57
  preserved but native source had `state.secretField` and emitted strings
  had generated `_v...` / `_p...`. Both properties failed, literal-only
  positive remained transformed and behaviorally equal.
- Minimal reproduction in isolated red branch
  `agent19/domstring-reflected-property-red-20261122`,
  `test/dom-reflected-property-source-browser.js`; evidence at
  `im-results/domstring-reflected-property-source-2026-11-22.md`.
- No patch is claimed in this red branch; do not merge it without a guard.
  The attribute-method patch is still draft PR #309 and only addresses
  method-call sinks, with separate native green evidence.

This is a broader architectural source-observer gap: host **property
assignment** may coerce functions to exact `Function#toString` through
Web IDL `DOMString`, just as host **method arguments** do. Recommend
provenance-aware source-coercion sink summaries for both assignment and call
edges, with object receiver checks and primitive-only private-key yield
positives. Avoid blanket bans on properties named `id` or `textContent`.

Please treat this as evidence for a canonical observer design rather than
another automatic standalone merge queue entry. Full malicious-runtime
tamper resistance and 2.5× budget remain unproven, RELEASE-BLOCKED.
