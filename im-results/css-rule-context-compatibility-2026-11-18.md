# CSS import-rule grammar and inert custom-property compatibility (18 November 2026)

**Agent 20. Classification: intermediate compatibility and source-publication engineering.**
No strong-obfuscation, hostile-runtime integrity or universal runtime-budget result is asserted.

## Reproducible regression

The prior lexer in `src/css-data-imports.js` recognized a CSS import keyword at any apparent token boundary outside strings and comments. It could not distinguish rule positions from declaration values. A legal custom property such as

```css
.widget { --payload: @import url(data:text/css,canary); color: var(--payload) }
```

therefore caused a false source-disclosure refusal in copied CSS, in inline HTML styles, in SVG styles and in SCO static-serving construction. The literal at-keyword inside that CSS declaration is data rather than an active stylesheet import. Compare the historical baseline [6980e63](https://github.com/FlareZ123/obfs/commit/6980e63c9b607c4673e4cbf19d4254f7003cd78f).

The revised implementation uses the pinned `css-tree@3.2.1` CSS parser and visits actual parsed `Atrule` nodes with a decoded import name. It conservatively refuses an import rule whose prelude is missing or opaque. Recognized `Url` and `String` first-child values are compared against normalized data schemes after CSS escape decoding. CSS-tree is lazy-loaded for stylesheet audit only; source-free JavaScript-only compilation does not initialize it. Existing HTML, SVG, and top-level CSS pathways share the same exported `hasCssDataImport` predicate.

This replacement is deliberately bounded. Parser recovery and differences across browser grammar implementations have not been exhaustively proved. Legitimate active data-stylesheet imports remain refused because their nested bytes are not recursively audited, and the scanner does not prove arbitrary published assets devoid of original source.

## Historical prepatch, positive protection and browser controls

The [paired executable comparison](../sims/css-rule-context-compatibility.js) receives separate immutable prepatch and candidate checkouts. The old lexer must flag an inert custom property and the new parser must accept it; both must flag an actual data-stylesheet import. The executable tests require:

- Three inert asset contexts (standalone CSS, HTML style, SVG style) in each of COO/SNO/SCO: **9 historical false refusals versus 9 new accepted, byte-identical output assets**.
- Three real CSS data-URL import checks under each of two compilers and three modes: **6/6 protective refusals**.
- A separate ordinary external CSS-import control: **6 unchanged accepted output files** from the two files emitted across the three modes.
- A SCO asset-handler construction comparison: **3 historical false refusals versus 3 accepted handler constructions**.

The [existing independent source-only extractor](../sims/css-nested-data-import-attack.js) still proves that a historical public CSS data import can reveal an entire original source-map `sourcesContent`, and requires the candidate to refuse that publication channel.

The [real Chromium fixture](../test/css-rule-context-browser.js) serves the accepted stylesheet via the generated SCO handler. The page's computed custom-property value must start with an inert import at-keyword, its stylesheet must contain exactly one CSSOM rule, and its ordinary style must remain `rgb(4, 5, 6)`. Successful evaluation requires the exact result `inert|1|rgb(4, 5, 6)`.

## Immutable validation

The complete focused [Windows and Ubuntu asset gate 44271775375](https://github.com/FlareZ123/obfs/actions/runs/44271775375) **passed** at exact candidate SHA `8d69e7b5a413ae2d02dc43f2c7e7056d1d8dd4bc`. Both jobs completed the paired historical control, existing asset source-extraction attacker, CSS/SVG/HTML tests and strict core JSDoc checks. Ubuntu also completed the existing Chromium SCO integration and the new Chromium custom-property grammar check.

Earlier successful incremental gate [44271616417](https://github.com/FlareZ123/obfs/actions/runs/44271616417) at `c907b3ec6b29f696de5c82ac19b1b76b24e66732` validated the historical red control, and [44270759387](https://github.com/FlareZ123/obfs/actions/runs/44270759387) at `6299ceebd0f757b0ea6e057b374b2c51f89d7ab2` validated the source and unit changes before the added controls.

## Scope and decision

The change affects asset admission at compile/publication time and adds no instructions to generated runtime JavaScript for accepted programs. The paired safe-output byte comparison verifies that specific claim for one exercised original and asset, without asserting a universal compute-performance bound. No independent attacker-cost advantage over ordinary minification is demonstrated. Source-only reverse engineering of the emitted JavaScript, authorized SCO relaying, SNO hostile-loader bypass and broader 2.5× violations remain unresolved.

This work should remain in `im-results/`. The historical parser proposal [PR #55](https://github.com/FlareZ123/obfs/pull/55) was created before the independently landed mainline lexer and is superseded by the minimal current-main adaptation in [PR #95](https://github.com/FlareZ123/obfs/pull/95).

## Deterministic grammar matrix follow-up

The [240-case at-rule/declaration matrix](../test/css-rule-fuzz.test.js) enumerates five differently encoded/cased import keywords, four comment/whitespace separators and six URL/string representations, yielding **120 actual stylesheet imports** and **120 paired inert custom-property declaration values**. Every active case must be identified, every inert case must be admitted. Five representative pairs per mode additionally execute native compiler admission across COO, SCO, and SNO, and direct SCO publication-handler construction preserves the same distinction. The historical source-only nested-map extraction checks remain in the asset workflow.

**Pinned validation:** the [two-platform manual asset gate 44273192525](https://github.com/FlareZ123/obfs/actions/runs/44273192525) passed at exact branch SHA `31c94e29922eed9e490fec7c1fe6be81b4756067`, including strict JSDoc and Chromium checks. The matrix proves only the enumerated grammar cases. It cannot prove that every malformed CSS recovery path or future browser/parser implementation agrees, nor does it add an obfuscation security boundary.
