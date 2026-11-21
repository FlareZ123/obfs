# Same-origin ResourceTiming observes emitted ESM byte length

**Agent 7, 21 November 2026. Status: intermediate compatibility correction.** This report concerns JavaScript's one-to-one observable behavior when a declared ESM application reads browser network metadata for its own public modules. It is not evidence of stronger obfuscation security, browser authorization, or performance compliance.

## Observation surface and model

The browser's [Resource Timing API](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Resource_timing) exposes resource entries even when a module was loaded implicitly by ESM imports. The [W3C Resource Timing 2026 Candidate Recommendation](https://www.w3.org/TR/2026/CRD-resource-timing-20261102/) defines the response-size metadata; `PerformanceResourceTiming.decodedBodySize` reflects response bytes after content decoding. Same-origin resource metadata is observable in this experiment with no explicit `fetch`, filesystem access, `Function#toString`, or source-text retrieval.

A closed-world module `state.mjs` exports an object with an eligible private field `secretField`. A dependent module reads its numeric value. A third declared module reads `performance.getEntriesByType("resource")` and selects the `state.mjs` entry to report the decoded size. Renaming the key changes `state.mjs` source length while preserving the numeric result. A declared program observing both values can distinguish the transformation, violating strict output parity.

## Real Chrome witness

The actual [`test/resource-timing-observer-browser.js`](../test/resource-timing-observer-browser.js) serves three independent same-origin ESM graphs from one HTTP server, with identical HTML and content types, in separate real headless Chromium sessions:

1. **Native** source, which returned `value:23` and `decodedBodySize:37`.
2. **Safe compiled** complete graph including the ResourceTiming observer, which emitted original source bytes and returned the same result.
3. **Unsafe counterfactual** from the compiler's successful two-file property rewrite with the observer restored afterward, which preserved `value:23` but returned `decodedBodySize:42`.

The unsafe two-file rewrite had `crossFile.properties:1`. The safe complete graph had `crossFile.properties:0`. The independent HTTP request sizes were also checked using `Buffer.byteLength`, and each browser value was checked against its corresponding response. The counterfactual is deliberately an **observer-excluded compilation**, rather than a claim that the fixed compiler produced unsafe output. It isolates the exact source rewrite whose byte-size effect the browser can distinguish.

The real-browser step passed on Ubuntu in [pinned workflow 44963731498](https://github.com/FlareZ123/obfs/actions/runs/44963731498) at source `3e9a427aca76fddb1b432c7b21a3ddac97e8d386`, reporting `RESOURCE_TIMING_CHROME {"nativeBytes":37,"unsafeBytes":42,"refusedKeys":0,"unsafeKeys":1,"valuesPreserved":true,"chromeSizeWitness":true}`.

## Reproducible falsification and compiler correction

An eight-case source-observer matrix was added to [`test/cross-file-source-byte-reader.test.js`](../test/cross-file-source-byte-reader.test.js), covering resource lists, named/toplevel aliases, `PerformanceObserver`, and decoded, encoded and transfer byte fields. Against original compiler source with **only those new tests**, all eight observer cases failed on both Linux and Windows in [CI 44963399373](https://github.com/FlareZ123/obfs/actions/runs/44963399373). An unrelated `performance.now()` positive control retained the ordinary eligible private-key rewrite.

The corrected `observesDistributedSource` preflight conservatively recognizes `PerformanceObserver`, resource-timing sizes and resource-entry methods across the three prescribed modes, and declines AST transformations of that source-visible graph. A follow-up alias pass treats unknown computed method selectors on a proved ambient Performance root, including simple aliases, `globalThis.performance`, global-object destructuring, const-key global access, and `Reflect.get(performance, unknownKey)`, as source-observable. A separate [source-island regression](../test/source-observer-islands.test.js) confirms that opt-in local property exceptions cannot bypass that refusal. Existing source-observer checks already propagate to the SCO HTTP publisher's per-request spelling decision.

The method deliberately errs on the side of conservatism for ambiguous member names and does not prove all possible aliases, ambient injections, host-side network interception, caches, or dynamically evaluated source. The API exposes resource length, not the original key spelling by itself; under the threat models, clients already control distributed bytes. The result is a **semantic compatibility** correction. The code under an observed source graph is unchanged, so no runtime overhead is introduced there. This experiment does not benchmark runtime across unobserved obfuscated graphs and does not establish a universal 2.5× guarantee.

## Release interpretation

The broader protection decision remains **RELEASE-BLOCKED**. Correctness requires measured parity against external resource metadata where an application relies on it; transforming visible modules under an unproved observer remains unsound. Applications that deliberately inspect their own source size may therefore receive a conservative no-op rather than a false assurance of successful obfuscation.
