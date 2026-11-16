# Distributed source-byte observations, closed-world ownership, and conservative refusal

**Status:** intermediate compatibility evidence, not a security result. **Date:** 2026-11-16. **Researcher:** Agent 34.

## Threat and semantic witness

The opt-in closed-world ESM field renamer assumes that all runtime observation of a private field runs through the proven object graph. That assumption is false when a module can inspect the *source bytes* of another distributed module. A two-module Node 22 program can observe both an own-field value and its exact source spelling:

```js
// state.mjs
export const state={secretField:23};
```

```js
// main.mjs
import {state} from './state.mjs';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('./state.mjs',import.meta.url),'utf8');
console.log(state.secretField,code.includes('secretField'));
```

The native output is `23 true`. A property-only rewrite of `state.secretField` to a generated `_p...` field, while keeping the original source-byte observer, changes the second observation to `false`. This is an observable semantic mismatch even if every field access is rewritten consistently and no `Object.keys` or `Function#toString` call occurs.

The issue generalizes to Node `fs/promises`, dynamic `import('node:fs')`, `createRequire(import.meta.url)`, CommonJS `require` aliases, and browser same-origin `fetch`/XHR requests for the emitted script. Dynamic module specifiers can hide a source-reading builtin. A browser global source-reader can also be obtained through `globalThis[key]` or `Reflect.get(globalThis,...)`.

## Candidate compiler behavior

The new `src/ast.js::observesDistributedSource` identifies recognized source-capable APIs and unresolved dynamic module loaders. `src/core.js` applies its refusal across all input JavaScript files, including a single self-readable module; `src/cross-properties.js` rejects unsafe cross-ESM field renaming; `src/sco.js` suppresses response-to-response spelling mutation for source-readable clients.

When requested source-byte preservation conflicts with a browser hostname-lock wrapper, both offline compilation and SCO handler construction now fail with an explicit `TypeError`. The wrapper would alter source bytes regardless of whether its hostname test passes. This is a build-time incompatibility refusal, not a bypass or an authorization proof.

The 2026-11-16 test graph `test/cross-file-source-byte-reader.test.js` exercises:

- One transformable, unobserved two-file ESM control (`crossFile.properties === 1`).
- Two native filesystem source readers, the Node `fs` and promise APIs (`crossFile.properties === 0`, original/emitted native behavior equal).
- Dynamic ESM builtin import and `node:module` createRequire indirection.
- CommonJS self-observation through an aliased runtime `require`, with exact emitted bytes.
- Browser `fetch`, XHR, dynamic global computed keys and `Reflect.get` refusal cases.
- Two explicit host-lock incompatibility refusals.
- Real HTTP SCO delivery, checking two returned variants equal the complete original observable source.

The source-checking grammar is deliberately **over-approximating**: an ordinary data `fetch`, some unused `node:fs` imports, and ambiguous dynamic-global member reads can disable all transformations for the entire group. This loses coverage; it is safer than silently changing observable source bytes. It does **not** discover opaque native extensions, custom loaders, arbitrary first-class reader aliases, external code outside the declared graph, or all transitive I/O mechanisms. True semantic preservation requires an integrator to close those gaps or declare a weaker source-observation contract.

## Evaluation and security interpretation

The focused Ubuntu/Windows [semantics run 43782745696](https://github.com/FlareZ123/obfs/actions/runs/43782745696) **passed** at exact source `09ae0950d8c4c49c32e7831e7e3136bdf8b9e662`. It validated the initial byte-reader cases, the rest of the targeted proof suite, both strict JSDoc checks, and selected examples. Subsequent loader/hostname/HTTP cases require their own pinned validation before claiming the broader matrix passes.

The later [full run 43782951695](https://github.com/FlareZ123/obfs/actions/runs/43782951695), source `3dcc378a3b9ab837a5ea409f3d7d6f7dc12c3025`, failed on both OSes in an independent, concurrently introduced reflective String-intrinsic mutation suite (`test/ambient-string-reflective-alias.test.js`), with seven sampled benchmarks, both strict type checks and Ubuntu Chromium otherwise passing. This failure does not substantiate a source-byte-reader regression, and the repository-wide release gate remains red at that SHA. Agent 46 received the targeted reproduction via `communications/agent46/2026-11-16T0056Z_agent34_full-gate-reflective-mutation.md`.

**Security:** no increased reconstruction or hostile-runtime resistance is claimed. COO and SNO source bytes remain available to the attacker under their full-control threat models. A file-identity-observing program can be too semantically constrained to obfuscate at all. **Performance:** retained byte-exact output has the original JavaScript hot path, but separate whole-session cost of SCO transport and other obfuscated programs is unmeasured in this study. The compiler's 2.5× restriction remains workload-specific.
