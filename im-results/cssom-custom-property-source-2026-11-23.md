# CSSOM custom-property setter is a native function-source observer

**Status:** intermediate, source-pinned compatibility counterexample. **Date:** 23 November 2026. **Author:** Agent 1. No production compiler patch or strong-protection claim follows from this record.

## Distinct native coercion path

The [CSSOM specification](https://drafts.csswg.org/cssom/#dom-cssstyledeclaration-setproperty) defines `CSSStyleDeclaration.setProperty(property, value, priority)` with a `CSSOMString` value. A function supplied as the value is string-coerced into its native `Function#toString` text. A CSS custom property can subsequently expose that text through `getPropertyValue`.

The compiler's current source-observer analysis in `src/ast.js` has guards for numerous native coercion APIs but no explicit CSSOM `setProperty`/style-instance handling. This is a different property/method family from the existing Agent 19 `Element.setAttribute`, `CSS.escape` and DOM reflected-property investigations.

Minimal browser input:

```js
function inspect(){const state={secretField:31};return state.secretField;}
const element=document.createElement("div");
const style=element.style;
style.setProperty("--observed",inspect);
export const observed={
  text:style.getPropertyValue("--observed"),
  number:inspect()
};
```

The input exports an already-observed primitive record. The function itself is not publicly exported. With the current COO transform, `inspect()` still returns 31, but `observed.text` contains generated names in place of `state` and `secretField`.

## Source-pinned evidence

1. **Red-first cross-platform simulated DOMString parity:** branch `agent1/cssom-setproperty-source-20261123` at `e8ff1b07a4176bab90e52d319955344c7f596179`; [focused Ubuntu/Windows run 45096435167](https://github.com/FlareZ123/obfs/actions/runs/45096435167). Four setter shapes (direct, computed, `.bind`, `Reflect.apply`) changed observed source spelling with `properties=1` and `bindings=2` in COO. The initial primitive positive fixture had an unrelated **cross-realm assertion harness error**, fixed at `c06be1432eb57a49363667e73639674d3cf6ad7a`. Subsequent [run 45096643857](https://github.com/FlareZ123/obfs/actions/runs/45096643857) showed **four red negatives and one green primitive positive** on each operating system.
2. **Independent mode matrix:** exact `f82780684cad310c2393d5c98bca7763d90fe12c`, [focused run 45096816444](https://github.com/FlareZ123/obfs/actions/runs/45096816444). On both Ubuntu and Windows, **12/12** setter-shape × COO/SNO/SCO source-observation parity checks failed, with the unrelated primitive private-field positive **passing** (1/13). The native `inspect()` numeric return remains 31 in the displayed counterexamples. These use a minimal JavaScript model of CSSOM `CSSOMString` conversion; they do not replace the real-browser test.
3. **Real Chromium native/emitted ESM:** exact `fef83c8a31fdad5d823e87b504a29137f215777f`, [manual browser run 45096545960](https://github.com/FlareZ123/obfs/actions/runs/45096545960). The Ubuntu Chrome job reached the new `test/cssom-custom-property-source-browser.js` step after its preceding browser integration checks passed, then failed the *expected* native/emitted parity assertion. It recorded **negative** `{properties:1,bindings:2}`, **positive** `{properties:1,bindings:3}`, and an HTML-run diagnostic with:
   - native `text="function inspect(){const state={secretField:31};return state.secretField;}"`, `number=31`;
   - emitted `text="function inspect(){const _vec7068dc2dea={\\\"_p3a65443ab8\\\":31};return _vec7068dc2dea._p3a65443ab8;}"`, `number=31`;
   - native/emitted primitive positive both `{text:"literal",number:31}`.

The browser test did not pass because it deliberately requires semantic parity. This is a verified compiler correctness counterexample, not a flaky browser startup or merely a detection-tool result. GitHub browser tests and model tests are isolated in the named research branch, with no mainline compiler modification.

## Acceptance criteria and limitations

A corrective candidate should preserve function source when an unproved function can flow to native CSSStyleDeclaration `setProperty`, including direct, computed, bound and reflective paths. It should verify actual receiver provenance before claiming a precise positive transform; false refusals may be acceptable for uncertain values. The primitive-literal positive fixture must continue to rename a truly private field and preserve behavior. Cross-platform focused parity, strict JSDoc and real Chromium must all pass on the exact integrated source pin.

The results do **not** imply original-source recovery from the obfuscated output, stronger source secrecy, general CSSOM coverage, 2.5× whole-session runtime compliance or execution restriction against an attacker controlling their browser. They are evidence that a native API can expose a changed function source even when the source AST spells no `String(inspect)` or `.toString()` call.

Coordination: Agent 3 owns the canonical source-observer integration, and Agent 19 has related Web IDL sink research. This branch is offered as a red-first test donor rather than a competing integration PR.

## Extended receiver/call-shape evidence

An isolated follow-up expanded the **actual Chrome** witness from direct style
setter invocation to **six** variants on the same `CSSStyleDeclaration`:
direct, computed `style["setProperty"]`, `bind`, `Reflect.apply`, detached
`setProperty` with explicit receiver, and a `style` receiver alias.

At exact source `77faadfcb78e7184971a25cec2ebcb3ba6711f50`,
[real-browser run 45097230788](https://github.com/FlareZ123/obfs/actions/runs/45097230788)
completed with the expected red parity assertion. Its browser dump shows
`a.text`, `a.computed`, `a.bound`, `a.reflective`, `a.detached`, and
`a.alias` all equal the original `function inspect()` source, while
each `b` counterpart contains the same generated names. Native and emitted
numeric results stay 31 in every path. The literal-positive cases have
`"literal"` for all six fields and return 31 in both builds. Negative
compile metrics were `{objects:1,properties:1,bindings:3}`; positive metrics
`{objects:1,properties:1,bindings:4}`. The increased binding count reflects
the expanded source fixture and must not be compared as an isolated
optimization against the earlier one-path source pin.

A separate distinct receiver-precision control uses an **ordinary user-defined
local method also named `setProperty`**. Its callback calls `inspect()`
without converting the function to source. That safe private-field
transformation remains eligible, so an unconditional refusal for every method
whose spelling is `setProperty` would lose demonstrated safe work. At
`04d4e2f005a5f32bbd6afd14041e1a5582068375`,
[two-platform focused run 45097332286](https://github.com/FlareZ123/obfs/actions/runs/45097332286)
reported **14 tests: 12 red parity negatives and 2 passing controls**
independently on Ubuntu and Windows.

These tests establish the need for **receiver-capability provenance**, such as
a tracked native Element `.style` or CSSRule `.style` object plus bounded
method aliases, when optimizing the source-observer preflight. They do not
prove any particular flow algorithm sound. An unrecognized receiver and
function-valued argument remain outside the verified positive-contract set.
