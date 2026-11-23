# Native CSSOMString source observation across three style receiver families

**Intermediate native browser evidence, 23 November 2026, Agent 1.**
The larger [10-sink native Web IDL matrix](webidl-domstring-source-capability-matrix-2026-11-23.md) is extended here with two new CSSOM `CSSStyleDeclaration` receivers. This is a *receiver-capability breadth* result for semantic correctness; it is not a compiler patch, proof of universal Web IDL sink coverage, or resistance to extraction.

## Source pin and provenance

Exact code and workflow source: `48f3135b2ebf103161dcac113e299385fe87d21e`, isolated branch `agent1/cssom-setproperty-source-20261123`. [Native Chrome Actions run 45099282592](https://github.com/FlareZ123/obfs/actions/runs/45099282592) (Ubuntu, Node 22.23.4). The 12-sink `sims/webidl-coercion-capability-matrix.js` step passed; the parent full browser workflow intentionally fails at the subsequent uncorrected CSSOM source-parity regression. Exact compiler outputs and observed original/emitted/positive browser values are retained in [raw JSON](cssom-style-receivers-native-matrix-2026-11-23.json).

## Grounded receiver matrix

| Proven native style receiver | Construction in real Chromium | Browser sees original `inspect()` source | Emitted exact source preserved | Primitive positive unchanged | COO property renames, negative / positive |
| --- | --- | --- | --- | --- | --- |
| HTML `Element.style` | `document.createElement("div").style` | Yes | **No** | Yes | 1 / 1 |
| SVG `SVGElement.style` | `document.createElementNS("http://www.w3.org/2000/svg","rect").style` | Yes | **No** | Yes | 1 / 1 |
| stylesheet `CSSStyleRule.style` | `new CSSStyleSheet();sheet.replaceSync(":root {}");sheet.cssRules[0].style` | Yes | **No** | Yes | 1 / 1 |

Every negative invokes `style.setProperty("--observed", inspect)` and reads `style.getPropertyValue("--observed")`. Each native browser result contains the original spelling `secretField`; the emitted result contains a renamed generated property and binding name. Both `inspect()` calls still compute 31. In each separate positive the input value is an already-primitive string `"literal"`, and the compiler genuinely renames its independent private field while preserving browser observations.

## Engineering significance

Native style-receiver proof cannot be restricted to an HTML element constructed by `document.createElement`. A bounded capability scanner must consider CSSOM style objects reached via SVG and CSS rules as potential conversion sinks, including method aliases or return values where proven. The named `setProperty` method on an ordinary local object that merely calls its function argument has a separately verified *positive control* and should remain eligible for safe private-key renaming. This motivates typed provenance instead of a global method-name denylist.

The tested finite source graph does not cover other CSSStyleDeclaration owners (e.g., different CSSRule subclasses), stylesheet changes, adopted stylesheets, inherited methods, cross-window realms, monkey patches, plugins, arbitrary values, or other browser engines. It demonstrates source-text semantic incompatibility, with no measurement of implementation fix cost or whole-program runtime limit.

The prior source-owner-closure requirements remain documented at [`workplace/agent1-source-observed-owner-closure-2026-11-23.md`](../workplace/agent1-source-observed-owner-closure-2026-11-23.md). Candidate integration responsibility remains with Agent 3 (canonical source-observer work) in consultation with Agent 19 (shared Web IDL host capability research); this branch is an independent test donor.
