# DOM source-observation capability graph — implementation proposal

**Status:** design proposal; not an implemented or validated source-observer fix.  
**Evidence:** `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
**Storage method evidence:** `im-results/agent19-sco-create-handler-storage-source-2026-11-23.md`  
**Test donor:** branch `agent19/domstring-property-setter-final-20261123`

## Problem statement

Function source is observable through more than explicit `Function.prototype.toString`, `String(fn)`, and method arguments. Native DOM/HTML APIs can perform implicit Web IDL conversion on values assigned to properties or passed to methods. If the value may be a function, native `ToString` can expose the function's source spelling.

The Chromium witness currently covers:
- 26 direct property-setter cases (20 DOMString-like setters, two TrustedHTML/DOMString parser setters with Trusted Types enforcement absent, and four alternate DOM receiver sources);
- nine reflective/aliased setter dispatch cases;
- a cross-file ESM producer/consumer assignment;
- `Element.insertAdjacentHTML` argument index 1;
- native `Storage.setItem` argument indices 0 and 1, captured-native `Reflect.apply` dispatch, and a same-named userland `setItem` positive control;
- positive controls for primitives, ordinary-object properties, own data-property shadowing, own custom-accessor shadowing, Proxy storage, and Proxy brand-check behavior.

The current mainline has a receiver-provenance-aware URL property-setter pattern in `src/ast.js::observesFunctionSource`, but no corresponding DOM setter family or `insertAdjacentHTML` rule. The complete evidence and limitations are in the report.

## Proposed analysis result

Replace the single source-observation boolean as the primary analysis product with a structured plan. Keep a boolean compatibility wrapper for conservative call sites during migration.

A conceptual record:

```js
/**
 * @typedef {{
 *   path: string,
 *   start: number,
 *   end: number
 * }} SourceSpan
 *
 * @typedef {{
 *   kind: string,
 *   path: string,
 *   start: number,
 *   end: number,
 *   receiver: string,
 *   member: string,
 *   argumentIndex: number|null,
 *   conversion: string,
 *   dispatchIdentity: 'native'|'captured-native'|'userland'|'unknown'
 * }} SourceSink
 *
 * @typedef {{
 *   functionSpan: SourceSpan,
 *   sink: SourceSink,
 *   closureBindings: string[],
 *   ownerProperties: Array<{binding: string, key: string}>,
 *   certainty: 'proven'|'may'
 * }} SourceObservation
 *
 * @typedef {{
 *   observations: SourceObservation[],
 *   preserveWholeFiles: string[],
 *   unresolvedEdges: string[]
 * }} SourceObservationPlan
 */
```

The exact identifiers and node representation should follow existing repository conventions. Stable AST node IDs or path+range spans are preferable to bare variable-name strings.

## Capability graph

Model four separate questions. Do not collapse them into a property-name lookup.

### 1. Receiver provenance

Track a small lattice of host-object types and aliases:

- `Document`: global `document`, `window.document`, `globalThis.document`;
- `Node`: `createTextNode`, `createComment`, node-valued properties and collections;
- `Element`: `createElement`, `getElementById`, `querySelector`, element collections;
- `HTMLElement` and specific HTML interfaces: tag-aware `createElement('input')`, `createElement('textarea')`, etc.;
- `UnknownHost`: possibly DOM, but not proven;
- `Userland`: ordinary object;
- `Proxy`: proxy wrapper with a separately analyzed trap.

Propagate through local aliases and assignments. Treat shadowed globals as userland. Extend across module boundaries only when the export/import flow is resolved; otherwise mark the edge uncertain.

The tests establish that direct `createElement` is not the only receiver source: `getElementById`, `querySelector`, `document.body`, and `createTextNode` also matter.

### 2. Setter identity and own-property state

For a candidate receiver/member pair, resolve whether assignment actually reaches the native Web IDL setter.

Use a descriptor-state lattice:

- `NativeInheritedAccessor`
- `OwnDataProperty`
- `OwnCustomAccessor`
- `MaybeShadowed`
- `UnknownDispatch`

Track `Object.defineProperty`, `Reflect.defineProperty`, and prior writes that may create an own property. A native DOM object plus `.id` is not sufficient: an own data property or own custom accessor shadows the inherited native setter.

Proxy traps require body-level analysis. The test pair distinguishes:
- forwarding with `Reflect.set(target,key,value,target)`, which reaches the native setter;
- storing the function reference in a custom trap, which does not.

A default proxy receiver can fail the Web IDL brand check and throw `TypeError`; this is not equivalent to a proxy trap that deliberately forwards with the underlying target as receiver.

### 3. Conversion capability

Maintain interface-aware setter/method metadata. Do not conflate all Web IDL conversions.

Examples:
- ordinary DOMString-like setters: `Document.title`, `Element.id`, `Node.textContent`, HTML element string attributes;
- HTML parser properties: `innerHTML` and `outerHTML`, whose IDL is a `TrustedHTML or DOMString` union;
- HTML parser method: `insertAdjacentHTML(DOMString position, (TrustedHTML or DOMString) string)`, where the source-bearing value is argument index 1.

Trusted Types enforcement and default policies can change whether a string conversion is accepted or rejected. The current parser-setter tests explicitly run with Trusted Types enforcement absent. Keep that environmental assumption explicit.

A source sink exists only if the actual selected setter/method path applies a conversion that can expose the function source. Do not infer it merely from a member name.

### Method-call dispatch: Storage DOMString arguments

The createScoHandler witness adds a method-call sink that must use the same capability graph, not a method-name-only exception. The actual single-file request path currently measures observesFunctionSource(parse(source,'module')) as false, emits per-request Unicode spelling changes and private-binding renames, and exposes those changes when Chromium's native Storage conversion stringifies the function value.

#### Receiver provenance

Add a distinct Storage receiver family:
- global localStorage and sessionStorage;
- window.localStorage / window.sessionStorage and globalThis equivalents;
- aliases whose origin is proven to be one of those Storage objects;
- unknown or shadowed identifiers remain UnknownHost/Userland until resolved.

Do not infer Storage from a variable name or a .setItem spelling. An ordinary userland object with a same-named method is a required positive control.

#### Effective callable identity

A method call is a source sink only when the effective callable and receiver are proven. Extend the current descriptor-state model with a method-dispatch lattice, for example:
- NativeInheritedMethod;
- CapturedNativeMethod;
- OwnDataMethod;
- OwnAccessorMethod;
- PrototypePatchedMethod;
- UserlandMethod;
- UnknownDispatch.

Track prior own-property writes, Object.defineProperty / Reflect.defineProperty, Storage.prototype mutation, captured method aliases, destructuring, bind, call, apply, and Reflect.apply. The native method must receive a genuine Storage receiver; Proxy wrappers need separate brand-check and forwarding analysis. A custom method that merely happens to be named setItem is not the native sink. A custom wrapper that calls a captured native Storage.prototype.setItem is a source sink at that inner call.

#### Conversion and function hooks

Storage.setItem converts both its key argument (index 0) and value argument (index 1) to DOMString. Either position can therefore receive a function object. The extended browser witness exercises both positions in one module: the function is first passed as argument 0 (key) and then as argument 1 (value). A captured Storage.prototype.setItem alias invoked through Reflect.apply also exposes source. A same-named userland setItem stores a function reference and retains a private-rewrite positive control. Own overrides, prototype patching, call/apply/bind variants, and cross-file dispatch remain open.

For an object/function input, the relevant conversion path is ToPrimitive with string hint followed by ToString. Track the effective Symbol.toPrimitive, toString, and valueOf hooks, including own properties, prototype changes, accessors, and hook bodies that may call native Function.prototype.toString. Do not equate "custom hook returns a primitive" with "no source observation": a hook may read native function source as a side effect and then return a constant. If the hook body or effective dispatch is unresolved, preserve the source conservatively.

The existing five-case Storage conversion control report is a useful bounded input to this analysis:
- own toString returning a primitive;
- own Symbol.toPrimitive returning a primitive;
- direct Function.prototype.toString.call bypass;
- JavaScript prototype override;
- patched Function.prototype.toString delegating to the native method.

The own-hook cases are also positive-yield controls: the current conservative file veto can decline unrelated renaming even when the effective hook does not expose source. The native direct bypass and patched-native-delegation cases are source-observing. Keep these effects distinct.

#### Keep method calls separate from named-property writes

Storage named-property assignment (storage[key] = value) is a separate dispatch path from Storage.setItem(key,value). The computed property key first has ECMAScript ToPropertyKey semantics; the Storage named-property setter then has its own Web IDL value conversion. Do not collapse this into the setItem method rule. Verify both the spec dispatch and browser behavior before admitting it. The current request-time witness says nothing about this named-property path.

#### SCO request-time integration

A source-observation plan must be computed once and consumed by every mutation stage. In the pinned handler, the group-level interfileSourceObserver expression does not call observesFunctionSource for a single-file group; varyLiteralSpellings nevertheless calls the boolean observer and receives false, then obfuscateFiles runs with identifiers/properties enabled. The new browser witness proves that this combination changes a source-observed function in the actual HTTP request path.

Do not repair this with a blanket .setItem ban or a whole-file veto as the final design. The preferred plan preserves the observed function's exact source span and its lexical/owner closure while still rewriting unrelated private bindings in the same module. The per-request spelling pass, identifier pass, property pass, and any later wrapper insertion must all consume the same plan.

### 4. Function and owner may-flow

Track function values through:
- direct declarations and expressions;
- local aliases;
- object properties and returns;
- imported ESM bindings;
- method extraction and `.call`/`.apply`/bound aliases;
- Proxy trap parameters and forwarding calls.

When a source-bearing function reaches a sink, propagate the observation to the producer module. Then compute its source closure:
- preserve the exact function source range (including identifiers, whitespace, literals, and member names);
- preserve lexical bindings referenced by that source;
- preserve the owner/property keys required by those references;
- preserve any cross-file property group members whose spelling must match.

The cross-file witness specifically requires preserving `observedOwner.secretField` in the producer even though the setter occurs in a separate consumer module.

## Transformation policy

### Preferred: selective source-preservation plan

Consume the plan in the transformation pipeline:

1. Do not rewrite source-observed function ranges.
2. Do not rename lexical bindings or owner-property keys referenced by those ranges.
3. Continue renaming unrelated private owners in the same file and graph.
4. Keep primitive-only input paths transformable.
5. Preserve public/external API names independently of the source-observation plan.

The matrix's positive controls are mandatory yield checks. A fix that simply freezes the entire file/group can restore parity but does not meet the obfuscator's selective-renaming objective.

### Fallback: conservative graph/file veto

When the analysis cannot prove receiver, setter identity, or value flow, retain the existing broad `remoteSourceObserver` veto or an equivalent conservative fallback. This is a correctness fallback, not the desired final architecture.

Current implementation seams:
- `src/ast.js::observesFunctionSource`: existing URL setter assignment pattern; add DOM receiver/setter capabilities and method argument sinks here or in a shared analyzer.
- `src/core.js`: `remoteSourceObserver` is currently one group-wide boolean that suppresses cross-file and much local transformation.
- `src/properties.js::proveLocalObject`: file-level observer proof returns `null`, also too coarse for selective owner closure.
- `src/source-observer-islands.js`: caller-selected pure primitive ESM leaves are not a substitute for the source-observed function's own closure-owner plan.

## Acceptance tests

A source-observer fix should turn the expected-red differential into a green regression suite:

1. Every native property/method source-observation case has exact native/emitted source parity.
2. The source-bearing owner key remains unchanged.
3. An unrelated private owner in the same module still renames.
4. Primitive-only assignments still rename unrelated private keys.
5. Ordinary-object `.id` reference storage remains behaviorally correct and is not misclassified as native DOM.
6. Own data-property and own custom-accessor shadowing controls remain correct.
7. Proxy native-forwarding and Proxy storage paths are distinguished; default Proxy brand-check behavior is preserved.
8. Cross-file ESM source observation preserves the producer-side function/owner closure.
9. Computed keys, aliases, `Reflect.set`, `Object.assign`, logical assignment, descriptor extraction, `.call`, `Reflect.apply`, and Proxy traps have explicit tests.
10. `insertAdjacentHTML` argument index 1 is recognized separately from `insertAdjacentText`.
11. Chromium differential, Node tests, and strict JSDoc pass on supported CI platforms; Firefox/WebKit coverage is a future requirement.

## Runtime budget and threat-model implications

The capability graph should be computed during obfuscation/build time wherever possible. Source-preserving output regions add no runtime work by themselves. Any runtime descriptor-integrity checks or anti-tamper guards in browser code count against the client runtime budget; the initialization exception is only available in the specific server initialization cases defined by the project objective.

This proposal establishes no 2.5× performance result, no resistance to dynamic extraction, and no domain-lock guarantee. Those require separate measurements and adversarial tests.


## Modern HTML parser/streaming API evidence (2026-11-23 update)

A HeadlessChrome 157.0.0.0 feature probe reports support for all 23 tested methods below. The differential found source mismatch in **23/23**, with all 23 primitive-only positive controls passing:

- `Element.setHTML`, `appendHTML`, `prependHTML`;
- `Element.setHTMLUnsafe`, `appendHTMLUnsafe`, `prependHTMLUnsafe`;
- `Element.beforeHTML`, `afterHTML`, `replaceWithHTML`;
- `Document.parseHTML`, `Document.parseHTMLUnsafe`;
- `Element.streamHTML`, `streamAppendHTML`, `streamPrependHTML`;
- `Element.streamHTMLUnsafe`, `streamAppendHTMLUnsafe`, `streamPrependHTMLUnsafe`;
- `Element.streamBeforeHTML`, `streamAfterHTML`, `streamReplaceWithHTML`;
- `Element.streamBeforeHTMLUnsafe`, `streamAfterHTMLUnsafe`, `streamReplaceWithHTMLUnsafe`.

The stream methods are particularly important. The method returns a `WritableStream`; the source-bearing function reaches the parser when passed to `writer.write(inspect)`. The analysis must propagate function values through the returned stream and writer acquisition to the underlying HTML parser sink. Treating only the stream-creation method as the sink misses the actual conversion edge.

The authoritative interface definitions and algorithms are in the [WHATWG HTML Standard, dynamic markup insertion](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html). The browser result is specific to HeadlessChrome 157.0.0.0; Firefox and WebKit remain untested. See the updated intermediate evidence report and raw artifact linked there.

Add these methods to the acceptance suite. For streaming methods, require native/emitted parity for both the source-bearing function chunk and primitive chunk; also test writer aliases, `pipeTo`, chunk arrays, and async boundaries separately.


### Stream dispatch variants

The stream sink matrix was extended with three additional value-flow paths, all
reproducing source mismatch with primitive-only positives passing:

1. Extract and bind `writer.write`, then call the bound method.
2. Invoke `writer.write.call(writer, inspect)`.
3. Enqueue the function in a `ReadableStream` and use
   `readable.pipeTo(target.streamHTML())`.

This confirms that the source-observation graph must cross method extraction,
bound-call semantics, asynchronous writer calls, and ReadableStream-to-
WritableStream piping. The sink cannot be modeled only as a direct argument to
`streamHTML()`; the function value reaches the HTML parser later as a chunk.


## Legacy Document.write/writeln control and current-main validation

A separate iframe-backed `Document.write`/`Document.writeln` control is already
source-preserved by the current source-observer path. Both native/emitted
source comparisons pass, but both the source-bearing and primitive-only
programs report **zero** private-property transforms. This is an observed
example of the current broad source-observer veto: correct preservation, no
selective yield.

The full matrix was then rerun from a branch created on current `main`.
The branch's `src/ast.js` SHA exactly matches current main:
`eea89ceb890cf190deb714751158a055c6cb2224`. Current-main CI run
45105560120 passed on Windows and Ubuntu, including Chromium and strict JSDoc.
The 26 property cases, 9 setter dispatch variants, insertAdjacentHTML sink,
23 modern HTML parser/streaming methods, and three stream dispatch variants
remain expected-red; Document.write/writeln remain protected with zero yield.

Current-main run:
https://github.com/FlareZ123/obfs/actions/runs/45105560120
Raw artifact:
https://github.com/FlareZ123/obfs/actions/runs/45105560120/artifacts/14786379254


### Cross-file ESM stream witness

A second cross-file graph exports the function from a producer module and
imports it in a consumer that writes it to `target.streamHTML()`. Native source
is `observedOwner.secretField`; emitted source is
`observedOwner._p2327adc78d`. Numeric/independent values and the
primitive-only cross-file counterpart pass. This proves that the stream-sink
source-observation edge crosses an ESM import boundary and asynchronous writer
path. The cross-file negative/positive graphs report 2/1 property
transformations respectively.

Current-main validation run 45105967275:
https://github.com/FlareZ123/obfs/actions/runs/45105967275
Artifact:
https://github.com/FlareZ123/obfs/actions/runs/45105967275/artifacts/14787730516


At 2026-11-23 03:28Z, the test branch's relevant compiler files matched
current main byte-for-byte: `src/ast.js`, `src/core.js`, `src/properties.js`,
`src/identifiers.js`, `src/strings.js`, `src/cross-properties.js`, and
`src/source-observer-islands.js`. The branch may be behind in unrelated
repository files; these exact source hashes are the basis for the current-main
claim.


The final manual-workflow branch `agent19/domstring-property-setter-final-20261123`
was created from the latest main immediately before validation. Run 45106288191
passed both OS jobs and strict JSDoc:
https://github.com/FlareZ123/obfs/actions/runs/45106288191


At the final-branch verification (2026-11-23 03:31Z), these seven files were
byte-identical between `main` and
`agent19/domstring-property-setter-final-20261123`:

- `src/ast.js`: `eea89ceb890cf190deb714751158a055c6cb2224`
- `src/core.js`: `8d33996821650de540b87502baff00a9e7ea99c7`
- `src/properties.js`: `5748e5b27146fe8a0b2937b0ad6b4bc4382ebe6f`
- `src/identifiers.js`: `c7e2ed1469381c5bc6dc42cef9a6ca8bfa347f0f`
- `src/strings.js`: `df489cf25a8aaeb87d90e6dc1b7eb66476da8dd6`
- `src/cross-properties.js`: `adb626c7533ac08cc51823b10bdbd9b09d966149`
- `src/source-observer-islands.js`: `e037ca7440e6a3c2eb0ae19247cd418625ec97a8`


### Classic parser APIs

The matrix also confirms two classic parser methods:
- `DOMParser.parseFromString(inspect, "text/html")`;
- `Range.createContextualFragment(inspect)`.

Both expose changed function source in emitted output and both primitive-only
positives pass. Current `src/ast.js` has no explicit method-name handling for
either. Include them alongside `insertAdjacentHTML`, the modern parser APIs,
and `Document.write/writeln` in the parser-sink metadata.


Trusted Types CSP enforcement/default-policy behavior remains unvalidated.
The attempted `iframe.srcdoc` harness did not reliably execute its child
module, so no conclusion is drawn; those experimental changes were reverted.


## Related CSSOM capability evidence

Agent 1's native Chromium tests establish a parallel `CSSStyleDeclaration.setProperty`
source sink across HTML, SVG, and CSSStyleRule.style receivers, including
direct, bracket, bound, `Reflect.apply`, detached, aliased, and cross-file ESM
calls. Literal and same-named ordinary userland positives demonstrate why a
name-only `setProperty` veto is unsafe. Integrate these as a distinct
CSSOMString receiver family in the same provenance/capability graph, while
keeping CSSOM counts separate from this DOMString/HTML parser matrix.

Reports:
- `im-results/cssom-custom-property-source-2026-11-23.md`
- `im-results/cssom-style-receivers-native-matrix-2026-11-23.md`
- `im-results/cssom-cross-file-source-observation-2026-11-23.md`
