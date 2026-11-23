# Native DOMString property-setter source-observation matrix

**Status:** confirmed expected-red semantic mismatch in the mainline compiler; no protection patch is included here.

**Research owner:** Agent 19  
**Date:** 2026-11-23  
**Reproduction branch:** `agent19/domstring-property-setter-matrix-20261123`  
**Final source pin:** `f7630b692f1c8b50c98236195a7afdff657b84bf`  
**Validation:** [GitHub Actions run 45103250484](https://github.com/FlareZ123/obfs/actions/runs/45103250484)

## Finding

The source-observation surface is not limited to native method calls whose Web IDL arguments undergo string conversion. Assigning a function object to a native DOM property can implicitly convert the function to text, and a subsequent property read can expose the exact original `Function#toString` spelling.

The current compiler's COO output changed that observable source in **26 of 26 tested native property-setter cases**. The test functions returned the same numeric values before and after compilation, so ordinary return-value tests alone would not detect the mismatch.

This is a correctness finding about source preservation, not evidence of resistance to static reconstruction, dynamic extraction, tampering, or execution outside an authorized environment.

## Reproduction design

The harness is `sims/domstring-property-setter-source-matrix.js` on the reproduction branch. It compiles closed-world ESM inputs with:

- `mode: 'coo'`
- `closedWorld: true`
- `properties: true`
- `identifiers: true`
- `strings: false`
- deterministic per-case seeds

For each negative case, the module creates a function whose body reads `observedOwner.secretField`, assigns the function to a native property, reads the property back as a string, and also checks the function's numeric result and an independent private owner. A corresponding primitive-only positive assigns the literal string `"literal"` to the same property and checks that unrelated private-property renaming remains available.

The suite also includes a plain JavaScript object control using a property named `id`. It stores and invokes a function without converting it to text. This guards against a name-only rule that would incorrectly classify every `.id` assignment as a DOM sink. A separate own-data-property control shadows the native `id` setter with `Object.defineProperty`; it stores the function reference and does not trigger DOMString conversion. The final two parser-setter cases use the HTML `TrustedHTML`/`DOMString` union under the runner's default environment with Trusted Types enforcement absent; they are reported separately from the 20 ordinary DOMString cases.

### Tested native property setters

| Native interface | Property |
|---|---|
| Document | `title` |
| HTMLElement | `id` |
| HTMLElement | `title` |
| HTMLElement | `lang` |
| HTMLElement | `slot` |
| HTMLElement | `className` |
| Node | `textContent` |
| HTMLInputElement | `value` |
| HTMLInputElement | `placeholder` |
| HTMLInputElement | `name` |
| HTMLTextAreaElement | `value` |
| HTMLImageElement | `alt` |
| HTMLIFrameElement | `name` |
| HTMLScriptElement | `text` |
| HTMLLabelElement | `htmlFor` |
| HTMLAnchorElement | `download` |
| HTMLButtonElement | `name` |
| HTMLOptionElement | `label` |
| HTMLOptionElement | `value` |
| HTMLFormElement | `name` |
| Element | `innerHTML` (TrustedHTML/DOMString union) |
| Element | `outerHTML` (TrustedHTML/DOMString union) |
| Element.id via Document.getElementById | `id` |
| Element.id via Document.querySelector | `id` |
| HTMLElement.id via `document.body` | `id` |
| Text.textContent via Document.createTextNode | `textContent` |

## Results

The final source-pinned workflow completed successfully. Its Ubuntu job ran the native-versus-emitted matrix in real Chromium; both Ubuntu and Windows ran the Node suites and strict typing checks.

| Check | Result |
|---|---:|
| Same-file native property-setter cases with changed function source | **26 / 26** |
| Same-file numeric return-value parity | **26 / 26** |
| Same-file primitive-only positive parity | **26 / 26** |
| Same-file primitive positives retaining one private-property rename | **26 / 26** |
| Plain-object `.id` function-reference control | **PASS** |
| Cross-file native property-setter source mismatch | **1 / 1** |
| Reflective/aliased setter dispatch variants with changed source | **8 / 8** |
| Reflective/aliased primitive-only positive parity | **8 / 8** |
| Own data-property shadowing control | **PASS** |
| Cross-file primitive-only positive | **PASS** |
| Existing focused Web IDL Node suite | **237 / 237** |
| Main project JSDoc and dedicated matrix JSDoc | **PASS** |

For each same-file negative, the compiler reported two property transformations; each primitive-only positive reported one. The plain-object control reported two transformations while preserving its function-call behavior.

### Cross-file witness

A separate `logic.mjs` producer exports a function that reads `observedOwner.secretField`. An `observer.mjs` consumer imports it and assigns it to a native element's `id` property.

Chromium read the following native source:

```js
function inspect(){return observedOwner.secretField;}
```

The compiled consumer read:

```js
function inspect(){return observedOwner._p0dfce9fb9c;}
```

The numeric result remained `57`; the independent value remained `73`. The cross-file negative reported two property transformations. Its primitive-input counterpart passed and retained one private-property transformation.

This shows that a property-setter sink must be able to propagate source-observation requirements from the consumer back to the imported callable and its producer-side owner fields.




### Receiver-provenance variants

Four additional cases established that the same setter behavior is reached through different DOM-object sources:

- `Document.getElementById` returning an `Element`;
- `Document.querySelector` returning an `Element`;
- the global document's `body` element;
- `Document.createTextNode` returning a `Text` node whose `textContent` setter is exercised.

All **4/4** reproduced source mismatch and all four primitive-only controls passed. The final same-file matrix therefore contains 26 cases: the original 20 DOMString-like setters, two TrustedHTML/DOMString parser setters, and four alternate receiver-provenance paths (which intentionally revisit `id` and `textContent` through different sources).

### Reflective and aliased dispatch variants

The final harness also tested eight ways of reaching the native setter. **All eight** changed function source in emitted COO output, while each corresponding primitive-only positive passed:

1. Computed literal key: `target["id"] = inspect`
2. Computed constant key: `const key = "id"; target[key] = inspect`
3. Aliased receiver: `alias.id = inspect`
4. `Reflect.set(target, "id", inspect)`
5. `Object.assign(target, { id: inspect })`
6. Logical assignment: `target.id ||= inspect`
7. Native descriptor setter: `setId.call(target, inspect)`
8. `Reflect.apply(setId, target, [inspect])`

The own-data-property shadowing control passed: `Object.defineProperty(target, "id", { value: inspect, ... })` stored the function reference and the compiled program still invoked it correctly. This separates actual native setter dispatch from a reflective operation that merely creates an own data property.

The final workflow uploaded the raw JSON summary as artifact
[domstring-property-setter-matrix](https://github.com/FlareZ123/obfs/actions/runs/45103250484/artifacts/14785394734).

## Required analysis direction

The source-observation analysis should model property assignment as a separate capability edge, not merely extend a list of `CallExpression` argument positions.

A candidate analysis needs at least:

1. **Receiver provenance:** prove that the assignment receiver is a native host object of a relevant interface, rather than an arbitrary object with the same property name.
2. **Setter identity and conversion semantics:** associate the proven receiver/property pair with its actual Web IDL conversion behavior. Do not assume every setter is an ordinary `DOMString`; some host properties normalize, parse, enumerate, or use other conversion types.
3. **Assigned-value may-flow:** track direct function values, aliases, imported callables, and relevant object/collection flows into the setter.
4. **Producer-side closure:** when the value is imported, propagate the source-observation fact back through the ESM graph and preserve the source-bearing function and every owner/property spelling visible in its source.
5. **Selective yield:** retain transformations for proven primitive inputs and unrelated private owners. A whole-file refusal may preserve semantics but is not sufficient evidence of a useful selective solution.
6. **Adversarial dispatch coverage:** separately test computed property names, aliases, `Reflect.set`, `Object.assign`, descriptors/accessors, shadowing, host monkey-patching, and uncertain receiver provenance.

The plain-object `.id` control is especially important: a global ban on property names such as `id`, `title`, or `value` would create avoidable false positives and destroy useful renaming yield.

## Scope and limitations

- The native property-setter matrix was executed in Chromium on the Ubuntu GitHub Actions runner; it is not a cross-browser result.
- The cross-file witness covers a direct ESM import and a direct `HTMLElement.id` assignment. It does not establish all inter-file aliases or reflective dispatch variants.
- The matrix does not cover custom elements, proxies, overridden setters, multiple realms, or all DOM/HTML IDL attributes.
- The test suite is an expected-red witness against the current compiler, not an implemented guard. The reproduction branch contains no source-observer fix.
- No performance measurement, 2.5× runtime-budget result, security-strength result, domain-lock result, or SCO/SNO security claim is established.

## Reproduction

From the repository root on the reproduction branch:

```sh
node sims/domstring-property-setter-source-matrix.js
node_modules/.bin/tsc -p jsconfig.domstring-matrix.json
```

The workflow is `.github/workflows/manual-web-idl-source.yml`. The test harness, dedicated JSDoc project, workflow changes, and raw CI artifact are preserved on the reproduction branch.

## Standards references

These standards define the relevant native DOM/HTML interfaces and setter algorithms. The exact source-readback mismatch above is established by the browser differential, not inferred solely from the IDL declarations.

- [WHATWG DOM Standard — Node and textContent](https://dom.spec.whatwg.org/#interface-node)
- [WHATWG HTML Standard — HTML elements and HTMLElement](https://html.spec.whatwg.org/multipage/dom.html)
- [WHATWG HTML Standard — input element](https://html.spec.whatwg.org/multipage/input.html)
- [WHATWG HTML Standard — form elements](https://html.spec.whatwg.org/multipage/form-elements.html)
- [WHATWG HTML Standard — anchor element](https://html.spec.whatwg.org/multipage/text-level-semantics.html#the-a-element)

**Disposition:** keep this as intermediate evidence in `im-results/`. It is a concrete source-preservation defect and a test donor for the canonical source-observer integration, not a publishable solution or a reason to change the project-wide **RELEASE-BLOCKED** decision.


## Current implementation seam

A source review of the pinned mainline shows a useful existing pattern and the principal selectivity bottleneck:

- `src/ast.js::observesFunctionSource` already has a native property-assignment observer for proven WHATWG `URL` instances (the `href`, `protocol`, `username`, `password`, `host`, `hostname`, `port`, `pathname`, `search`, and `hash` setters). It uses receiver provenance via `isWebInstance` and refuses non-primitive right-hand sides. DOM/HTML property setters are not represented by an equivalent receiver-aware family in the current observer.
- `src/core.js` computes one `remoteSourceObserver` boolean across the prepared file group. When true, cross-file property renaming is skipped and ordinary local property/identifier/string transformations are broadly disabled, apart from the explicitly selected source-observer-island exception.
- `src/properties.js::proveLocalObject` also returns `null` when the file-level `observesFunctionSource` proof is true. This is safe but too coarse to satisfy the matrix's selective-yield objective.
- `src/source-observer-islands.js` currently admits deliberately pure primitive ESM leaves selected by the caller. It is not an automatic owner-closure analysis for a function whose own source is being exposed.

A first conservative implementation can reuse the URL setter pattern to close the correctness gap. The stronger target is a per-function/per-owner source-observation plan: preserve the observed function's exact source spelling and all referenced closure bindings/property keys, propagate that plan across ESM imports, and continue renaming provably unrelated owners. A graph-wide veto should remain the fallback when the analysis cannot localize the observation, not the final selective solution.
