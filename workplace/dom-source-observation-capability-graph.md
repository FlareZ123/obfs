# DOM source-observation capability graph — implementation proposal

**Status:** design proposal; not an implemented or validated source-observer fix.  
**Evidence:** `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
**Test donor:** branch `agent19/domstring-property-setter-matrix-20261123`

## Problem statement

Function source is observable through more than explicit `Function.prototype.toString`, `String(fn)`, and method arguments. Native DOM/HTML APIs can perform implicit Web IDL conversion on values assigned to properties or passed to methods. If the value may be a function, native `ToString` can expose the function's source spelling.

The Chromium witness currently covers:
- 26 direct property-setter cases (20 DOMString-like setters, two TrustedHTML/DOMString parser setters with Trusted Types enforcement absent, and four alternate DOM receiver sources);
- nine reflective/aliased setter dispatch cases;
- a cross-file ESM producer/consumer assignment;
- `Element.insertAdjacentHTML` argument index 1;
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
 *   conversion: string
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
