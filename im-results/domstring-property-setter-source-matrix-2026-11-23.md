# Native DOM property and HTML parser source-observation matrix

**Status:** confirmed expected-red semantic mismatch in the mainline compiler; no protection patch is included here.

**Research owner:** Agent 19  
**Date:** 2026-11-23  
**Reproduction branch:** `agent19/domstring-property-setter-final-20261123`  
**Current-main validation pin:** `f3d19ad0b1e5ef991adda5062f9722710018ee6a`
**Current main `src/ast.js` SHA:** `eea89ceb890cf190deb714751158a055c6cb2224`  
**Validation:** [GitHub Actions run 45107404758](https://github.com/FlareZ123/obfs/actions/runs/45107404758)

## Finding

The source-observation surface includes both native writable property setters and HTML parser method arguments whose Web IDL conversions expose function source. Assigning a function object to a native DOM property can implicitly convert the function to text, and a subsequent property read can expose the exact original `Function#toString` spelling.

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

The suite also includes a plain JavaScript object control using a property named `id`. It stores and invokes a function without converting it to text. This guards against a name-only rule that would incorrectly classify every `.id` assignment as a DOM sink. A separate own-data-property control shadows the native `id` setter with `Object.defineProperty`; it stores the function reference and does not trigger DOMString conversion. A custom own accessor setter on a DOM element also stores the function reference and invokes it successfully without stringification. The final two parser-setter cases use the HTML `TrustedHTML`/`DOMString` union under the runner's default environment with Trusted Types enforcement absent; they are reported separately from the 20 ordinary DOMString cases.

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
| Cross-file ESM stream-sink source mismatch | **1 / 1** |
| Reflective/aliased setter dispatch variants with changed source | **9 / 9** |
| Reflective/aliased primitive-only positive parity | **9 / 9** |
| Own data-property shadowing control | **PASS** |
| Own custom-accessor shadowing control | **PASS** |
| Proxy storage-trap control | **PASS** |
| `Element.insertAdjacentHTML` method source mismatch | **1 / 1** |
| `insertAdjacentHTML` primitive-only positive parity | **PASS** |
| Modern HTML parser/streaming methods with changed source | **23 / 23** |
| Modern HTML parser/streaming primitive-only positive parity | **23 / 23** |
| Classic `DOMParser`/`Range` parser sinks with changed source | **2 / 2** |
| Classic parser primitive-only positive parity | **2 / 2** |
| Async stream writer/pipeTo dispatch variants with changed source | **3 / 3** |
| Async stream writer/pipeTo primitive-only positive parity | **3 / 3** |
| Cross-file primitive-only positive | **PASS** |
| Cross-file stream primitive-only positive | **PASS** |
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
9. Proxy forwarding trap: `proxy.id = inspect`, where the trap forwards to the native setter with `Reflect.set(target, key, value, target)`.

A complementary proxy-storage trap that intercepts the assignment and stores the function reference without calling the native setter also passed; native and compiled programs both invoked the stored function and returned 57. This distinguishes a proxy that forwards to a native setter from one that simply stores the assigned value.

The own-data-property shadowing control passed: `Object.defineProperty(target, "id", { value: inspect, ... })` stored the function reference and the compiled program still invoked it correctly. This separates actual native setter dispatch from a reflective operation that merely creates an own data property.

The final workflow uploaded the raw JSON summary as artifact
[domstring-property-setter-matrix](https://github.com/FlareZ123/obfs/actions/runs/45107404758/artifacts/14787743674).


### Setter-identity negative control

A final control installs an **own custom accessor** on a real DOM element's `id` property with `Object.defineProperty`. Its setter stores the assigned function in an ordinary own field; a later call returns 57. Native and compiled outputs match, and unrelated private-property transforms remain available.

This complements the own-data-property control: a proven DOM receiver and familiar property name are not sufficient. The analysis must establish that the assignment actually reaches the native Web IDL setter rather than an own data property or custom accessor that shadows it.

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
- The cross-file suite covers a direct ESM import and `HTMLElement.id` assignment, plus an ESM producer whose function is passed through a consumer's `streamHTML()` writer. It does not establish all inter-file aliases or reflective dispatch variants.
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
- [WHATWG HTML Standard — dynamic markup insertion (`innerHTML`/`outerHTML` TrustedHTML-or-DOMString setters and `insertAdjacentHTML` method argument)](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html)

**Disposition:** keep this as intermediate evidence in `im-results/`. It is a concrete source-preservation defect and a test donor for the canonical source-observer integration, not a publishable solution or a reason to change the project-wide **RELEASE-BLOCKED** decision.




### Cross-file ESM stream witness

A second cross-file graph exports `inspect` from a producer module and imports it in a consumer module. The consumer creates `target.streamHTML()`, obtains a writer, and awaits `writer.write(inspect)` and `writer.close()`. The native source is:

```js
function inspect(){return observedOwner.secretField;}
```

The emitted source is:

```js
function inspect(){return observedOwner._p2327adc78d;}
```

The numeric result (57), independent value (73), and primitive-only cross-file counterpart all pass. The negative graph reported two property transformations and the positive graph one. This confirms that the stream-sink source observation crosses an ESM import boundary into an asynchronous writer path.

## Related HTML parser method sink: insertAdjacentHTML

The same harness tests one separate method-call sink. It invokes:

```js
target.insertAdjacentHTML("beforeend", inspect);
```

and reads the inserted text back through `target.innerHTML`. In Chromium, the native source was:

```js
function inspect(){return observedOwner.secretField;}
```

The compiled source was:

```js
function inspect(){return observedOwner._pb3295925cc;}
```

The function's numeric result remained 57 and the independent value remained 73. The literal-string positive passed; the negative reported two property transformations and the positive one. The source observer's current `src/ast.js` contains no `insertAdjacentHTML` sink rule.

The HTML Standard declares `insertAdjacentHTML(DOMString position, (TrustedHTML or DOMString) string)`. This test exercises the second argument with Trusted Types enforcement absent, so the DOMString conversion path is active. The method is not part of the 26 property-setter count; it is an additional method-call sink that should be covered by the call-argument source-observation analysis.


## Modern HTML parsing and streaming API matrix

The Chromium feature probe found all 23 tested modern HTML parsing/streaming methods available. Every supported method changed the function source in emitted COO output, while all 23 primitive-only positives passed. Each negative reported two private-property transformations; each positive reported one.

The methods tested were:

1. `Element.setHTML`
2. `Element.appendHTML`
3. `Element.prependHTML`
4. `Element.setHTMLUnsafe`
5. `Element.appendHTMLUnsafe`
6. `Element.prependHTMLUnsafe`
7. `Element.beforeHTML`
8. `Element.afterHTML`
9. `Element.replaceWithHTML`
10. `Document.parseHTML`
11. `Document.parseHTMLUnsafe`
12. `Element.streamHTML`
13. `Element.streamAppendHTML`
14. `Element.streamPrependHTML`
15. `Element.streamHTMLUnsafe`
16. `Element.streamAppendHTMLUnsafe`
17. `Element.streamPrependHTMLUnsafe`
18. `Element.streamBeforeHTML`
19. `Element.streamAfterHTML`
20. `Element.streamReplaceWithHTML`
21. `Element.streamBeforeHTMLUnsafe`
22. `Element.streamAfterHTMLUnsafe`
23. `Element.streamReplaceWithHTMLUnsafe`

The streaming cases create the native HTML stream, obtain a writer, and pass the function object to `writer.write(inspect)`; the stream sink converts the chunk to text and the inserted source is read back from the DOM. This is a distinct asynchronous source-observation path, not merely another direct method argument.



### Classic HTML parser APIs

Two additional, widely deployed parser APIs were tested separately from the 23 modern methods:

- `DOMParser.parseFromString(inspect, "text/html")` — read back through `parsed.body.textContent`.
- `Range.createContextualFragment(inspect)` — append the returned fragment and read back through `target.innerHTML`.

Both **2/2** cases exposed changed function source; both primitive-only positives passed. A search of current `src/ast.js` found no explicit `DOMParser`, `parseFromString`, or `createContextualFragment` method handling.

### Asynchronous stream dispatch variants

Three additional cases exercise value flow through the same `streamHTML` sink:

1. Extract and bind `writer.write`, then call the bound function with `inspect`.
2. Invoke `writer.write.call(writer, inspect)`.
3. Enqueue `inspect` into a `ReadableStream` and pass that stream to `readable.pipeTo(target.streamHTML())`.

All **3/3** variants reproduced changed source and all three primitive-only positives passed. These cases establish that the sink path includes method extraction/binding and asynchronous stream piping, not only a direct `writer.write(inspect)` expression. The HTML API matrix now contains 23 distinct supported methods plus these three dispatch variants.

### Browser environment

The final browser runner reported:

```text
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36
```

All 23 HTML parsing/streaming API feature probes returned `true`. This result is specific to HeadlessChrome 157.0.0.0; Firefox and WebKit have not been tested. A search of the current `src/ast.js` found no method-name handling for this modern HTML insertion/streaming family.


## Existing Document.write/writeln coverage and yield cost

A separate control used `iframe.contentDocument` and called `Document.write(inspect)` or `Document.writeln(inspect)`, then read the resulting body text. Both were already protected by the current source-observer path:

| Case | Source parity | Numeric/independent parity | Negative transforms | Primitive-positive transforms |
|---|---:|---:|---:|---:|
| `Document.write` | **PASS** | **PASS** | 0 | 0 |
| `Document.writeln` | **PASS** | **PASS** | 0 | 0 |

This is a useful contrast with the unprotected DOM property and modern HTML method sinks. The current implementation preserves the observed function source, but its broad source-observer veto also prevents unrelated private-property transformations for both the source-bearing and primitive-only programs. It is therefore correct but not selective.

## Validation against current mainline

The harness was copied to a branch created from current `main`, rather than relying on the earlier stale research branch. The current-main workflow passed on Windows and Ubuntu, including the real Chromium differential and both strict JSDoc checks. The validation branch's relevant compiler files match current main byte-for-byte: `src/ast.js` (`eea89ceb890cf190deb714751158a055c6cb2224`), `src/core.js` (`8d33996821650de540b87502baff00a9e7ea99c7`), `src/properties.js` (`5748e5b27146fe8a0b2937b0ad6b4bc4382ebe6f`), `src/identifiers.js` (`c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`), `src/strings.js` (`df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6`), `src/cross-properties.js` (`adb626c7533ac08cc51823b10bdbd9b09d966149`), and `src/source-observer-islands.js` (`e037ca7440e6a3c2eb0ae19247cd418625ec97a8`).

All previously reported expected-red findings remained unchanged against this current source:
- 26/26 native property setter cases;
- 9/9 setter dispatch variants;
- `insertAdjacentHTML` method sink;
- cross-file ESM stream sink;
- 23/23 modern HTML parser/streaming methods;
- 2/2 classic DOMParser/Range parser methods;
- 3/3 asynchronous stream writer/pipeTo variants.

The two legacy Document writer controls remained protected, but with zero transformation yield.

## Current implementation seam

A source review of the pinned mainline shows a useful existing pattern and the principal selectivity bottleneck:

- `src/ast.js::observesFunctionSource` already has a native property-assignment observer for proven WHATWG `URL` instances (the `href`, `protocol`, `username`, `password`, `host`, `hostname`, `port`, `pathname`, `search`, and `hash` setters). It uses receiver provenance via `isWebInstance` and refuses non-primitive right-hand sides. DOM/HTML property setters are not represented by an equivalent receiver-aware family in the current observer.
- `src/core.js` computes one `remoteSourceObserver` boolean across the prepared file group. When true, cross-file property renaming is skipped and ordinary local property/identifier/string transformations are broadly disabled, apart from the explicitly selected source-observer-island exception.
- `src/properties.js::proveLocalObject` also returns `null` when the file-level `observesFunctionSource` proof is true. This is safe but too coarse to satisfy the matrix's selective-yield objective.
- `src/source-observer-islands.js` currently admits deliberately pure primitive ESM leaves selected by the caller. It is not an automatic owner-closure analysis for a function whose own source is being exposed.

A first conservative implementation can reuse the URL setter pattern to close the correctness gap. The stronger target is a per-function/per-owner source-observation plan: preserve the observed function's exact source spelling and all referenced closure bindings/property keys, propagate that plan across ESM imports, and continue renaming provably unrelated owners. A graph-wide veto should remain the fallback when the analysis cannot localize the observation, not the final selective solution.


## Related CSSOM evidence from Agent 1

The CSSOM `CSSStyleDeclaration.setProperty` family is a related but distinct
Web IDL sink family and is not included in the counts above. Agent 1 has
independently verified native Chromium source exposure across HTML Element,
SVG Element, and `CSSStyleRule.style` receivers; direct, bracket, bound,
`Reflect.apply`, detached-reference, and aliased-receiver calls; and a
cross-file ESM producer/consumer witness. Literal-string and same-named
ordinary userland `setProperty` positives preserve behavior while retaining
unrelated property transforms. This is strong evidence that receiver
provenance—not a name-only ban—is necessary.

See:
- `im-results/cssom-custom-property-source-2026-11-23.md`
- `im-results/cssom-style-receivers-native-matrix-2026-11-23.md`
- `im-results/cssom-cross-file-source-observation-2026-11-23.md`

These CSSOM results complement this DOMString property/HTML parser matrix;
do not merge their counts or infer that this matrix covers all CSSOM sinks.


## Recommended implementation order

1. Add semantic Web IDL sink metadata for native writable-property setters,
   `insertAdjacentHTML`, modern safe/unsafe HTML parser methods,
   `DOMParser.parseFromString`, and `Range.createContextualFragment`.
2. Track receiver provenance and property values through direct calls,
   bracket dispatch, aliases, `Reflect.apply`, bound methods, and cross-file
   ESM imports. Do not apply a method-name-only ban; Agent 1's same-named
   userland `setProperty` positive demonstrates the false-positive risk.
3. Model HTML stream creation as a source-bearing capability whose returned
   `WritableStream` carries values through writer aliases, `write.call`, and
   `ReadableStream.pipeTo` before DOM insertion.
4. Replace the current all-or-nothing source-observer veto with a selective
   source-observation plan that preserves the function's observable source and
   only the owner/key spellings that source requires, while allowing proven
   independent private-property transformations.
5. Keep `Document.write/writeln` as a conservative baseline, but add a
   positive-yield requirement: primitive-only and unrelated-owner controls
   should still transform when safe.
6. Convert this expected-red diagnostic into semantic regression tests after
   the selective implementation lands; add Firefox/WebKit and a dedicated
   HTTP-header-based Trusted Types harness before making cross-browser claims.

No production patch is included in this contribution. The report establishes
reproducible source-observation gaps and their yield controls, not a completed
obfuscator or a security-release claim.
