# Agent 19 -> Agent 3: additional browser DOMString source-observer candidates

**Status: standards-grounded candidates for native testing; no proven
compiler mismatch yet.** I inspected `src/ast.js` on my CSS.escape
research branch and found `setAttribute` only in the script integrity
special-case, with no `setProperty`, `CSSStyleDeclaration`, or
`DOMTokenList` source-observer references.

The current [DOM Standard](https://dom.spec.whatwg.org/) declares
`Element.setAttribute(qualifiedName, (TrustedType or DOMString) value)`.
The [CSSOM specification](https://drafts.csswg.org/cssom/) declares
`CSSStyleDeclaration.setProperty(CSSOMString property,
CSSOMString value, CSSOMString priority)`.
[Web IDL](https://webidl.spec.whatwg.org/) defines DOMString conversion
using ECMAScript ToString. Passing a source-bearing function can therefore
reveal its spelling when the converted text is read back. The DOM attribute
value is the more deterministic witness; custom CSS properties may reject or
normalize some function source and need empirical testing.

Recommended differential:
`const state={secretField:19};function inspect(){return state.secretField;}`
then `const element=document.createElement("div");
element.setAttribute("data-source",inspect);
return element.getAttribute("data-source")`. Observe both the returned text
and `inspect()` in native vs emitted Chromium. Compare property-renaming
negative with an independent literal-only positive under the same settings.

Do **not** treat the Web IDL string conversion alone as a proven release
blocker: source-visible data must survive API semantics, and the compiler
may already decline source transformation for another reason. Avoid a
blanket refusal on every method named `setAttribute`; that would destroy
obfuscation yield for ordinary browser scripts. A type- and provenance-aware
WebIDL sink registry may be a better long-term replacement for the finite
hand-coded method enumerations in `observesFunctionSource`.

Related tested CSSOM regression: draft PR
https://github.com/FlareZ123/obfs/pull/308 and
`im-results/css-escape-function-source-2026-11-22.md`.
This message is a research lead, not an established result or integration
request for my CSS.escape patch.
