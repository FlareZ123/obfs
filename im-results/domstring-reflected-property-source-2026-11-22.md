# Native DOMString reflected scalar properties observe original function source

**Status: reproduced native Chromium behavioral mismatch on current main.
This is an unpatched red witness, not an implemented protection.**
Agent 19, 22 November 2026. Isolated research branch:
`agent19/domstring-reflected-property-red-20261122`.

## Mechanism

The [WHATWG DOM Standard](https://dom.spec.whatwg.org/)
defines DOM string-valued attributes and their setters. On a native Element,
assigning a function to `element.id` converts that function through
ECMAScript string conversion. `Node.textContent` also stores text obtained
from a function-valued assignment. Both results can be read back as strings,
and therefore their values can include the exact original
`Function#toString` spelling of an input function.

This broadens the known class beyond calls to native `setAttribute` and
`setAttributeNS`: ordinary **property assignment** can transit through
Web IDL DOMString conversion without a syntactic `.toString()`.

## Reproducible native Chromium RED

[Full native Chrome run 45085898680](https://github.com/FlareZ123/obfs/actions/runs/45085898680)
at exact `da228cd965fbcc211a46c0d96e29c32c8c27dc2d` failed the
`Probe native DOMString reflected property source parity` step after
actual Chromium evaluated the original and compiled ES modules.
The failure is an expected semantic regression on the unpatched compiler.
The fixture is `test/dom-reflected-property-source-browser.js`.

The original module used:

```js
function inspect(){const state={secretField:57};return state.secretField;}
const element=document.createElement('div');
element.id=inspect;
element.textContent=inspect;
export const observed={id:element.id,text:element.textContent,value:inspect()};
```

Native Chromium yielded the literal original source in both `id` and
`text`, and numeric value 57. The emitted module preserved 57 but
reported function text containing generated `_v...` and `_p...`
identifiers and properties, changing the observable string.
Emitted `properties=1`, confirming private-key transformation.

An independent positive fixture assigned only primitive `"literal"`
to both DOMString properties and kept an unrelated private record with
`secretField:57`. The compiler still transformed that private field
(`positive.properties=1`), and native/emitted positive results matched.
The fixture exported only the resulting primitive record, never a public
callable, so unrelated public-function source guards cannot explain
the observed mismatch.

This standalone red branch intentionally fails CI until a correctness
guard exists. It must not be mistaken for an accepted compiler patch or
a reason to merge the red test onto main unguarded.

## Direction and limits

A source-observation engine that enumerates only explicit
`CallExpression` sinks will miss writable native properties.
Potential generalization: define a host-API source-conversion capability
summary with separate **argument-to-DOMString** and
**assigned-property-to-DOMString** edges, receiver provenance constraints,
and exception behavior, then let analysis conservatively refuse source
transformations only when a function may flow into such an edge.
Do not globally refuse every syntactic assignment to an `id` or
`textContent` property on unrelated user objects, and retain a
primitive-only renaming positive with each new capability rule.

This is a **confirmed semantics defect in the measured compiler and
browser environment**. It makes no claim about attacker extraction effort,
host-lock strength, SCO/COO/SNO security, or the 2.5× budget.
Project `results/README.md` remains RELEASE-BLOCKED.
