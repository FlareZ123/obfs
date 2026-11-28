# Browser Web IDL native string conversion as a JavaScript source-observation effect

**Research reference (Agent 1, 28 Nov 2026).** This document is a standards-grounded effect model and verification guide, not a newly established security result or a claim that the current compiler universally preserves source.

## Normative chain

1. The [WHATWG Web IDL Standard](https://webidl.spec.whatwg.org/#js-DOMString) converts an ECMAScript value to IDL `DOMString` using `ToString(V)` (subject to appropriate exception handling). This conversion is implicit at native interfaces taking DOMString arguments even when supplied JavaScript contains no explicit `String`, `.toString`, `eval` or reflective calls.
2. [ECMA-262 Function.prototype.toString](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) returns available `[[SourceText]]` for ECMAScript functions. Since ES2018 the source must include original whitespace/comments when available; see [MDN reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString). `String(fn)` in a normal unmodified realm consequently yields the function source. This is an observable part of program behavior, not just a debugging tool.
3. The [WHATWG DOM Standard](https://dom.spec.whatwg.org/#interface-element) defines `Element.setAttribute( DOMString qualifiedName, DOMString value )` and related Web IDL methods; a JavaScript function passed as the second argument can therefore expose its source via DOMString conversion. The setter must be tested with exact stored text, not just normal return values or whether the original name appears somewhere.
4. The [WHATWG DOM collection interfaces](https://dom.spec.whatwg.org/#interface-nodelist) distinguish a `NodeList`/`HTMLCollection` from the `Element` obtained through indexed access or `.item()`. `querySelectorAll()` yields a static `NodeList`; `getElementsByClassName()` and `getElementsByTagName()` yield live collections (see [MDN DOM traversal guide](https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Selection_and_traversal_on_the_DOM_tree)). A compiler that tracks only direct `document.querySelector` results but not collection item flows can miss a source-observing native receiver.

## Engineering implications and limits

- Treat a function value crossing a genuine native DOMString interface as a **source-text observation**, requiring exact preservation of the observed function's bytes/formatting. Same-width property substitutions preserve some stack line/column values but not exact Function#toString.
- Require a receiver-provenance proof. `const receiver={setAttribute(_name,value){return 17}}` is a userland method, so a name-only `setAttribute` blacklist suppresses safe protected work for no proven reason.
- Track collection and receiver identities through const aliases, function results, ESM import/reexport namespace edges, and cross-file calls; ambiguous or mutated host capabilities may force conservative refusal under a hostile host. `obfuscateFiles({mode:'sco'})` is not equivalent to the *actual* SCO HTTP per-request source-transform boundary.
- Exhaustive universal parity is impossible against a host context that observes all shipped bytes, so qualify empirical claims by the exact runtime trust assumptions, input graph, tested native implementations, compiler SHA and protection-yield count.

## Reproduction links

- Indexed collection AST and real-Chromium tests on [Agent 1 collection branch](https://github.com/FlareZ123/obfs/tree/agent1/dom-nodelist-native-source-guard-20261128): `test/agent1-dom-nodelist-indexed-source-parity.test.js`, `test/agent1-dom-nodelist-real-browser.test.js`; **pending source-pinned validation at writing**.
- Actual cross-file SCO HTTP test/fix [candidate branch](https://github.com/FlareZ123/obfs/tree/agent1/v2-sco-domstring-group-parity-fix-20261128); latest exact CI receipt must be checked independently and may remain pending.
- Repository [source trust frontier](../workplace/source-observation-trust-frontier-2026-11-28.md) and [release decision index](../results/README.md) distinguish standards-grounded conversion semantics from unproven protection claims.
