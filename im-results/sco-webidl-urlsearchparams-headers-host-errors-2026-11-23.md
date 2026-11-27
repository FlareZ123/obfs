# SCO relocation of Web IDL constructor native errors: URLSearchParams and Headers

**Agent 8, 23 November 2026. Intermediate result.** Two source-pinned generated-client Chromium/Node parity failures and a bounded conservative compiler admission repair. This is a compatibility check, with **no claim of strong obfuscation, anti-debugging, full application equivalence or universal <=2.5× runtime cost**.

## Live original / generated / private Node red-first witness

Source-only test branch `agent8/sco-urlsearchparams-host-errors-20261123`, immutable commit `3e99dec184be67e2efa55b946eb99141a66a0c1b`, [red CI 45253614435](https://github.com/FlareZ123/obfs/actions/runs/45253614435), Node **22.23.4**, Chromium **157.0.8103.78**.

The test generates a genuine selected SCO export and serves its client facade through `createScoHandler` on a same-origin Node HTTP server. A browser cookie authorizes reads, RPC and individual operations; the test separately asserts unauthenticated RPC receives **HTTP 403**. Each source is also executed directly as a Chromium original and a trusted Node server private function.

| Selected private source | Native Chromium original | Generated facade and private Node |
| --- | --- | --- |
| `try{new URLSearchParams([['a']]);return 'ok'}catch(e){return e.name+':'+e.message}` | `TypeError:Failed to construct 'URLSearchParams': Failed to construct 'URLSearchParams': Sequence initializer must only contain pair elements` | `TypeError:Each query pair must be an iterable [name, value] tuple` |
| `try{new Headers({'bad name':'x'});return 'ok'}catch(e){return e.name+':'+e.message}` | `TypeError:Failed to construct 'Headers': Invalid name` | `TypeError:Headers.append: "bad name" is an invalid header name.` |
| `new URLSearchParams([['a','1'],['b','two']]).toString()` | `a=1&b=two` | `a=1&b=two` |
| `Math.imul(17,19)` | `323` | `323` |

The two invalid-constructor cases **failed semantic parity assertions** at the test-only source pin as intended. The valid pair-list constructor and unrelated protected arithmetic passed all original/facade/server comparisons, proving that safe selected work did execute over authenticated HTTP. The successful valid `Headers({'x-demo':'ok'}).get('x-demo')` control was added in the subsequent green run and returned `ok` in all three places.

The public contracts allow an iterable of two-value string tuples for `URLSearchParams`, and Node documents that each pair must have exactly two elements. References: [Node.js URLSearchParams constructors](https://nodejs.org/download/release/v22.18.0/docs/api/url.html) and [MDN URLSearchParams constructor](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/URLSearchParams). Exact cross-host native exception message strings above are observed outputs, **not** documentation-derived assumptions.

## Bounded compiler admission repair

Added `usesUnprovedRelocatedWebIdlConstructors` in `src/sco-selective-partition.js`, invoked for both selected-private export/helper bodies and **transitive private static ESM dependency ASTs**. It refuses first-class, dynamically supplied or structurally malformed `URLSearchParams`/`Headers` host constructors before relocating them to Node, while allowing narrowly proven literal cases:

- `URLSearchParams`: no arguments, one plain ASCII string literal, or one direct array literal of complete two-element ASCII string pairs.
- `Headers`: no arguments, or a direct plain object literal whose initializer keys are bounded lowercase ASCII token names and whose values are printable ASCII strings.
- Other free references to those constructor bindings remain unproved. Ordinary method call syntax on a directly created object remains eligible under the existing cross-realm program scanner.

The syntax is a **deliberately conservative subset** rather than arbitrary Web IDL parity or identity proof. A caller-modified browser environment, first-class constructor aliases and runtime-dependent values are outside scope; some genuinely safe forms may now be refused. The chosen grammar retains the proven query and header positives, and the original nonzero arithmetic protected work remains selected.

## Source-pinned green validation

Patched compiler at `f7e888586dba5c2d778b26aec0705994d81b92d9` completed [focused 45254138187](https://github.com/FlareZ123/obfs/actions/runs/45254138187) **SUCCESS Ubuntu+Windows** with strict project/external/budget JSDoc. Extended test-only source `91e99f4ed191c741c8fc4bc82d03e1cc919aa800` added private imported ESM graph admission tests and completed [focused 45254398465](https://github.com/FlareZ123/obfs/actions/runs/45254398465) **SUCCESS both OS**, including strict JSDoc. Ubuntu exercised **7 / 7** tests: two invalid constructor refusals, valid pair-list query serialization `a=1&b=two`, valid header retrieval `ok`, protected arithmetic `323`, direct static positive/negative admission, and transitive imported-private-ESM static positive/negative admission. Windows executed static and graph cases and intentionally skipped real Chromium tests.

The source-pinned green tests retain all three original/facade/private values for each admitted browser positive. The private ESM test exercises **graph compilation/admission only**, without asserting generated multi-module browser execution. The broader full Node mainline was not rerun by either focused workflow.

## Release and remaining risk

This correction closes two independently observed native error-text changes in the measured Node/Chromium pair under declared static syntax. It does **not** prove exact parity for all input types, same-named local globals, arbitrary overloaded constructor semantics, prototype identity, future runtime versions, hostile instrumented clients, authorization of all RPC paths, anti-oracle confidentiality, or any 2.5× universal runtime guarantee.

The primary research and product release decision remains **RELEASE-BLOCKED**. The source-pinned comprehensive mainline [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841), collected **before this patch**, was red with 26 failing tests each OS. This evidence must remain distinct from the narrower focused green.
