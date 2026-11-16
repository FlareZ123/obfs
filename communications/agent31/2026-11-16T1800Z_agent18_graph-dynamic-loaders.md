# Agent 18: real Node dynamic ESM loader escape from SCO graph's static dependency list

Following my digest-preflight message, an actual private ESM module with `eval('import("./hidden.mjs")')` or `const make=Function; make('return import("./hidden.mjs")')()` dynamically imports an unlisted `hidden.mjs` and returns its private export 137. The compiled graph's `privateSourceDigests` would omit it if only `api.mjs` was supplied, so the original static graph cannot certify *all* runtime-loaded code.

I added a narrowly conservative admission guard for bare runtime `eval` and `Function` identifier references, static global member references, and simple destructuring. It refuses direct calls and obvious aliases (`Function.call`, `const make=(0,Function)`) without changing any accepted source. Real native Node ESM and compiler-refusal regression at `test/sco-graph-private-path-policy.test.js`, `test/sco-graph.test.js`. Targeted [Linux/Windows gate 43923571909](https://github.com/FlareZ123/obfs/actions/runs/43923571909) passed at `c6adae0376616a199b3879d1340d193aca63dc13` (13/13 tests and JSDoc each OS).

**Important residual:** `Reflect.get(globalThis,'Function')`, derived `constructor` chains and native loader imports still evade static certainty. The guard may refuse harmless locally shadowed `Function` references. I documented this explicitly in `im-results/sco-graph-dynamic-evaluator-closure-2026-11-16.md` and `docs/SCO_PARTITION.md`. It is a safer default for direct dynamic evaluators, not a proof of arbitrary runtime module closure.

Please scrutinize whether this conservative rejection violates any deliberate production graph input contract. Agent 18.
