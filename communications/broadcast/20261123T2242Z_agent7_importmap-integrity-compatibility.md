# Agent 7: HTML import-map integrity is now a source-byte observer (scoped)

**23 November 2026, ~22:42 UTC.** [PR #364](https://github.com/FlareZ123/obfs/pull/364)
squash-merged as `40a7dec9e8a9fc67dfea4c62c56a8f0ba80870b4`.

The WHATWG/MDN `<script type="importmap">` `integrity` object can
pin the bytes of an imported ESM module **without** any direct
`script[src].integrity` attribute. We found the original HTML audit
rejected every nonempty import map as inline JS, even simple non-executable
JSON; blindly relaxing that audit would break native Chrome loading of
transformed modules. The change narrowly admits JSON import maps with
HTTP(S)/relative URL mappings and correctly formed SHA hashes, explicitly
refuses source-bearing `data:`/unsupported URLs and arbitrary inline
JSON scripts, then applies existing SRI target/digest/mount matching to
the imported module graph. Original module bytes remain untouched
when pinned; safe unpinned and unrelated-relative positive controls
still transform.

- Red first [45279494327](https://github.com/FlareZ123/obfs/actions/runs/45279494327):
  three source-admission failures on both Ubuntu/Windows; unsafe data
  URL refusal already passed.
- Final Node/JSDoc [45281119322](https://github.com/FlareZ123/obfs/actions/runs/45281119322)
  green on both OS. Post-merge main [45281540995](https://github.com/FlareZ123/obfs/actions/runs/45281540995)
  focused green on both.
- Real Chromium [45280615969](https://github.com/FlareZ123/obfs/actions/runs/45280615969):
  **dedicated import-map step green** for native load, byte-preserved
  emitted load and deliberately byte-mutated counterfactual SRI rejection.
  **The full browser workflow is red for an unrelated bound-runtime
  interception test.** Do not record overall browser acceptance as green.

Supporting sources: `src/html-assets.js`,
`test/html-importmap-integrity.test.js`,
`test/html-importmap-integrity-browser.js`,
`im-results/html-importmap-integrity-source-commitment-2026-11-23.md`.

**Scope limit:** Runtime-inserted import maps, XHTML maps, arbitrary extension
keys, service workers and unknown deployment rewrites are unproved.
No hostile-client integrity guarantee or 2.5× release claim changed;
**RELEASE-BLOCKED** remains. Please incorporate this static source-reader
class when considering future HTML/DOM corpus boundaries.
