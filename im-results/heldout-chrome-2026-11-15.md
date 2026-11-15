# Live-Chromium differential of a multi-file property-flow corpus

Date: 2026-11-15. Agent 14. Status: bounded browser-compatibility evidence, no claim of independent protection against hostile browser instrumentation.

## Execution and pinned evidence

Reproducer: [test/heldout-browser-integration.js](../test/heldout-browser-integration.js).
Shared generated ESM corpus: [sims/heldout-object-flow-attack.js](../sims/heldout-object-flow-attack.js).
Manual-only [browser workflow](../.github/workflows/manual-browser.yml).
Pinned commit **47e87a50b84937e5c9eaf355815c9afbc7228d5f**, [run 43710440347](https://github.com/FlareZ123/obfs/actions/runs/43710440347).

The Ubuntu runner used **Google Chrome 157.0.8103.50** with Node.js 22. The existing live-Chrome suite passed, followed by the new multi-file ESM graph differential and repository JSDoc typecheck.

A local Node HTTP server served two independent graph collections: unmodified source and compiled COO JavaScript. A separate external HTML page ran an ESM harness and initialized global window.api before importing each graph's entry module through actual Chromium network requests. The browser evaluated all imports and top-level await operations, then wrote JSON results into the DOM. The harness used the same API semantics for both collections, and the Node evaluator compared the resulting parsed arrays.

## Observations

| Measurement | Chrome 157 |
|---|---:|
| Generated multi-file ESM graphs | 30 |
| Graphs with positive rename proof | 9 |
| Graphs deliberately refusing rename | 21 |
| Private-property fields renamed | 18 |
| Original vs obfuscated browser-result matches | 30/30 |
| Browser module-graph execution failures | 0 |

The positive graph types were direct named imports, exported pure-property reader functions, and exported identity forwarding. Negative kinds were externally computed property names, JSON serialization, reflective own-key access, an unknown external object-reader callback, a pure reader also invoked on another object shape, source-introspection of a function, and a runtime dynamic import. Chrome exercised the user-facing ESM loader rather than Node's module linker. The Node differential and static-renaming attacker observations are documented separately in [the source-only coverage study](heldout-object-flow-attack-2026-11-15.md).

## What the experiment does not establish

The 30 cases are synthetic, deterministic and sampled once per graph, with a locally provided external API. They do not constitute arbitrary JS observational equivalence, complete web API coverage, real browser-matrix coverage (Firefox and WebKit were untested), or proof that a malicious client cannot modify the code. The test does not execute an external static deobfuscator inside Chrome; it validates the compiled artifact's runtime behavior against the native source. Hostname locking, RPC secret retention, cold-start cost, hot-path slowdown and unauthorized code modification were outside this browser experiment.

This positive browser result matters because cross-module source transformations may preserve Node ESM behavior while failing the browser resolver or browser host APIs. Under this controlled suite, no such regression appeared. Future compatibility claims should extend the corpus with callbacks, DOM-specific reflection, module workers, import maps, and browser-specific syntax while retaining strict protected-surface counts.
