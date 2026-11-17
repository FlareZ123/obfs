# Nested CSS data imports can distribute original source maps

**Agent 20, 17 November 2026. Intermediate preflight research; experimental branch.**

## Claim and exact threat boundary

An HTML `<style>`, an SVG `<style>` or an ordinary `.css`
asset can carry `@import url("data:text/css;base64,...")`. The imported
stylesheet can contain a CSS `/*# sourceMappingURL=data:application/json;base64,... */`
comment and a version-3 source map whose `sourcesContent` contains a
copy of the original, unobfuscated program. The original bytes are entirely
recoverable from the public outer asset, without a live browser, compiler
seed, private server account, or deobfuscation algorithm.

The existing asset preflight scans source-map comments in the *outer*
CSS and inside HTML/SVG `<style>`. A nested CSS import's base64 payload
does not match the outer scan. This attack is a source-publication
configuration mistake, not evidence against transformation of the
actual executable code.

## Falsifiable paired experiment

[`sims/css-data-import-attack.js`](../sims/css-data-import-attack.js)
checks the immediate prepatch compiler at exact
[`72832cc7eefc2c1b9ea18acaa20d14a1295487b9`](https://github.com/FlareZ123/obfs/commit/72832cc7eefc2c1b9ea18acaa20d14a1295487b9)
against this candidate branch. For each of COO, SCO and SNO, it
compiles the original CommonJS program and one of three public
assets (CSS, HTML, SVG). It requires that the emitted executable
bytes differ from the native source while the module's runtime value
remains exactly equal under isolated Node VM execution.

The attack then receives only the emitted asset bytes, decodes the CSS
data URL, decodes the nested version-3 source map, and requires
the complete original program in `sourcesContent[0]`. It requires
that the candidate refuse the same public asset preflight.
Separately, a real HTTP GET of the prepatch SCO handler must recover
the original, while candidate SCO handler construction refuses.

No genuine browser stylesheet loading is required to make this
source-disclosure argument. The recipient already has the asset bytes.

## Candidate intervention

`src/css-data-imports.js` uses the pinned CSS-tree parser to locate
`@import` at-rules and read decoded `Url` and `String` tokens
(including CSS identifier escapes). It refuses any import using an
opaque `data:` URL, rather than trying to recursively validate
arbitrary nested CSS and embedded maps. Malformed import preludes
also cause refusal. `src/source-maps.js`, `src/html-assets.js`,
and `src/svg-assets.js` call this scanner for ordinary CSS and
inline stylesheet text. The checks occur during compilation or
SCO handler creation, before protected files are published.

The CSS-tree dependency is loaded lazily when a stylesheet is
actually audited, leaving JavaScript-only compilation outside the
new parser initialization. The paired attacker also checks that the
candidate emits byte-identical executable JavaScript and public CSS
for an accepted external stylesheet under the same seed and options.
The original and candidate still require independent
runtime-budget measurements for untested applications.

The new [regression tests](../test/css-data-import-disclosure.test.js)
include direct CSS `url(...)`, quoted imports, escaped CSS
identifiers, and safe external stylesheet and PNG URL controls,
across COO/SCO/SNO and SCO direct publication.

## Validation status

A targeted existing manual Linux/Windows workflow was dispatched
against branch commit `e93b2beb5c3b775218878fd55adcac79e53a3482`
as [run 44051545584](https://github.com/FlareZ123/obfs/actions/runs/44051545584).
**As written, both jobs are still queued.** Do not claim successful
parser behavior, source recovery, safe compatibility, or strict
JSDoc until the exact run verifies them. The branch remains
experimental and unmerged pending that evidence.

This adds no runtime JS to accepted distributions. It does add
compiler-time CSS parsing and a production parser dependency,
which require explicit validation. No cross-platform full-session
2.5× runtime bound or universal correctness proof is claimed.

## Important limits

All payloads remain recoverable when raw original source is deliberately
published through some other encoded, compressed, URL or comment field.
This guard covers a specific recognized CSS `@import` route.
Full-control COO/SNO attackers can still recover transformed public code,
and legitimate SCO clients may still relay private computations.
Conservative refusal also disables legitimate `data:` CSS imports,
a documented compatibility change. Do not promote this report
to `results/` as an academic strong-obfuscation advance.
