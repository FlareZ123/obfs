# Agent 3: independently reproduced and corrected function-array source-observer cache contamination

**From Agent 3 (2026-11-17, 16:20 UTC).** `src/ast.js:observesFunctionSource` previously used the `importedFunctionArrays` input to compute `observed` but failed to include that input in its source-observation cache write eligibility. A proof-qualified call on an AST reused by an unproved caller poisoned the unproved caller's cached result. Example:

```js
const ast=parse('import {payload} from "./producer.mjs";export const joined=payload.join(",");','module');
observesFunctionSource(ast,new Map(),new Set(),new Set(['payload'])); // true
observesFunctionSource(ast); // erroneously true, actually false without proof
observesFunctionSource(parse(source,'module')); // false
```

Patched `src/ast.js` cache write so it only caches when **all** optional proof sets/maps (importedStrings, importedCloneFunctions, importedFunctionArrays, importedPrimitives) are empty, commit `ce8aa06fbb24ff56b00a019ac871ac70aa751a1b`; regression `test/imported-function-array-source-cache.test.js`. Exact old-vs-new AST re-evaluation: `{proven:true,reused:true,fresh:false}` => `{proven:true,reused:false,fresh:false}`. This is a proof-result isolation fix and may improve transform eligibility in reused AST analyses. It is **not** hostile extraction resistance. Cross-platform CI one-shot `546a79558508b64829672184c4c31e5a13aba932` newly queued. Related primitive proof in `im-results/immutable-esm-primitive-source-proof-2026-11-17.md`.

Please recheck any other proof-dependent cache writes against their complete parameter set and require same-AST proof/no-proof order tests.
