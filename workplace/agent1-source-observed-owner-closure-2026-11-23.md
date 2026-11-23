# Source-observed function closure must extend across outer owner definitions

**Agent 1, 23 November 2026. Status: architectural design constraint supported by a bounded two-OS counterexample.** No implementation, compile-time complexity proof, security promotion or performance guarantee is claimed.

## Concrete problem

A JavaScript obfuscator changes an object's private property keys and all known uses so the program computes the same values. Separately, a native host API can convert a locally held function into a string whose contents are observable. The most direct measured path is `CSSStyleDeclaration.setProperty("--x", inspect)` followed by `getPropertyValue("--x")`.

The following self-contained module has two privately owned fields:

```js
const observedOwner = { observedSecret: 31 };
function inspect() { return observedOwner.observedSecret; }

const unrelatedOwner = { unrelatedSecret: 73 };
const style = document.createElement("div").style;
style.setProperty("--observed", inspect);

module.exports = {
  source: style.getPropertyValue("--observed"),
  number: inspect(),
  independent: unrelatedOwner.unrelatedSecret
};
```

The compiler needs to preserve `inspect`'s **original exact source text**, its numeric result `31`, and `independent===73`. The independent owner can still be renamed. A file-wide transformation refusal meets semantic parity but loses this unrelated obfuscation opportunity. A token-range-only freeze that leaves the function body unchanged yet renames `observedOwner.observedSecret` in the outer object definition would instead break `inspect()`.

## Source-pinned evidence

The independent Node VM model, `test/cssom-source-owner-closure.test.js` at exact `7b5b50f1f732de3cd3f0f21f0019be61056a2ebc`, ran on Ubuntu and Windows in [focused run 45098779908](https://github.com/FlareZ123/obfs/actions/runs/45098779908).

Both systems reproduced:

- `properties=2, bindings=1`; this source pin genuinely transformed both private owners.
- Native observed function text `function inspect(){return observedOwner.observedSecret;}`.
- Emitted observed text `function inspect(){return observedOwner._p44e21a099a;}`.
- Both computations still yielded 31 and 73; **source spelling changed**.
- **1 negative mismatch** plus **1 numeric-call-result positive pass** on each operating system. The positive passes `inspect()`, already a number, to the same setter and requires both private owner fields to transform.

Actual Chromium demonstrated the CSSOM function-source conversion independently with six native setter shapes in [run 45097230788](https://github.com/FlareZ123/obfs/actions/runs/45097230788). The dual-owner illustration above has been run in a JavaScript model of the CSSOMString conversion, not yet as a separate native Chromium dual-owner module.

## Constraint graph for a prospective compiler repair

The following are **design requirements**, not a validated algorithm:

1. A native host sink descriptor associates a proven receiver capability and argument index with a potential `Function#toString` obligation. For `CSSStyleDeclaration.setProperty`, it is the CSSOMString value argument at index 1. Method aliases, computed members and `Reflect.apply` may carry the method identity.
2. An observation root associates the potentially converted function with a **lexical source span**. All transformed identifiers, literals, object key references and function shape changes inside the span can change exact source bytes.
3. A source-fixed property use inside that function imposes a **constraint on the entire owner/key equivalence class**, including definitions and aliases **outside** the function span. The example requires retaining the `observedSecret` key on `observedOwner` as well as in `inspect`'s text. Lexical binding references can impose the same outer-definition spelling constraints.
4. Unrelated owner classes remain transformable when their alias/escape proofs establish separation. The example's `unrelatedSecret` field should still rename. Whole-file refusal may be temporarily safe but is a measurable loss of protection yield.
5. A literal or provably primitive call result (`style.setProperty("--x", inspect())` when the number result is established) should not impose a function-source obligation. A userland method **also named** `setProperty` that calls its callback without stringifying it should not be mistaken for a native CSSOM sink solely by spelling.
6. Cross-file imports, exports, captured lexical variables, returned closures, destructuring, rebinding and dynamic property accesses require conservative may-flow propagation. A finite list of browser-native APIs is not a proof that all host source observations are covered.

A plausible implementation represents source-observation roots and semantic identity links as two interacting worklists: one over callable/source spans and another over object/key alias equivalence classes. Any proposed incremental proof should measure **native/emitted parity, preserved independent rename yield, compile-time work and runtime compute** separately. Unknown ownership may require refusal; claiming a selective proof without its actual external/host closure is unsound.

## Acceptance gate

A correct targeted candidate for this bounded source example should satisfy all of:

- `native.source === emitted.source`, including spaces, exact identifier spelling and property names;
- `native.number === emitted.number === 31`;
- `native.independent === emitted.independent === 73`;
- **exactly one** privately owned field remains renamed, the unrelated owner;
- the numeric-result positive transforms both private owner fields and keeps identical outputs;
- ordinary userland `setProperty` naming collision remains independently renamable;
- real Chromium, Ubuntu/Windows Node 22 strict JSDoc and the complete source-observer integration suite pass at the same source pin.

This requirement should feed the existing Agent 19 [Web IDL capability-graph proposal](webidl-source-coercion-capability-graph-2026-11-22.md) and the Agent 3 canonical source-observer integration. It does not claim a solution to full-control static/dynamic reconstruction, SCO authorized-service relay, SNO owner tamper resistance, or universal 2.5× compute.

## Confirmed source-spelling preservation for a simpler captured lexical binding

A separate bounded source-safety control discriminates **outer property-key**
closure from an ordinary captured primitive lexical binding. At exact branch
SHA `5c4a20c47d3295b613eaba839d8288a79f59efb4`,
[two-platform focused run 45100668437](https://github.com/FlareZ123/obfs/actions/runs/45100668437),
the following additional input **already preserves native source parity**
while still renaming an unrelated private owner property:

```js
const capturedValue=31;
function inspect(){return capturedValue;}
const independentOwner={unrelatedSecret:73};
style.setProperty("--observed",inspect);
```

The source string in both original and emitted builds was exactly
`function inspect(){return capturedValue;}`; native/emitted numbers
remained 31 and 73; emitted `metrics.properties=1` and
`metrics.bindings=1`. The original two-owner **property-reference**
case within the same run remains **red** (its original
`observedOwner.observedSecret` changes into a generated key);
an explicit `String(inspect)` baseline remains
source-equivalent through coarse refusal with `properties=0`.
That focused suite therefore reported **3 green controls and 1 red
property-key case on each OS**.

This example is evidence that the existing property-key closure
problem is narrower than an indiscriminate inability to preserve
every captured outer variable under this exact input. It does **not**
prove general lexical capture correctness across reassignment,
destructuring, imports, shadowing, closures, or dynamic access.
A future capability graph should reuse verified lexical provenance
instead of adding a second competing name tracker.
