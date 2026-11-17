# Node process built-in module source-observation boundary (17 November 2026)

**Status: focused implementation and native-API checks completed; exact-source CI queued as of 08:41 UTC. Intermediate compatibility evidence only.**

## Concrete source-visible contract

Node.js 22 includes `process.getBuiltinModule(id)`, which returns Node built-in modules including `node:fs`. See the [Node.js 22 process documentation](https://nodejs.org/download/release/v22.23.5/docs/api/process.html#processgetbuiltinmoduleid). An input program may extract this method from `globalThis.process`, a `node:process` import, or a CommonJS `require('node:process')` result, then read its own physical file and inspect exact source tokens. This is an ordinary supported Node API, independent of attacker instrumentation.

A representative CommonJS input is:

```js
'use strict';
const {getBuiltinModule: load} = process;
const io = load('node:fs');
const privateObject = {secretField: 31};
const bytes = io.readFileSync(__filename, 'utf8');
console.log(privateObject.secretField, bytes.includes('secret' + 'Field'));
```

Native source produces `31 true`. If a property pass changes the object key and matching member access while retaining the separated source-literal terms, the source-reader returns `31 false`. Before this patch, the distributed-source classifier did not recognize the destructured `getBuiltinModule` route. Direct `process.getBuiltinModule(...)` was already recognized because the member name appeared in the local AST; the bypass concerns alias and reflection spellings.

## Scope of implemented correction

The `src/ast.js::observesDistributedSource` preflight now:

- recognizes `getBuiltinModule` as a process-root capability, including destructured members and `Reflect.get` / `Object.getOwnPropertyDescriptor` access;
- checks a `globalThis.process` object used directly as a destructuring/reflection receiver;
- recognizes simple local aliases of `require('node:process')` and default/namespace ESM imports from `node:process`;
- rejects direct named ESM imports of loader-capable process methods and direct CommonJS process-module destructuring when the key gives source-reading capability;
- retains a positive own-property-renaming control for unrelated `process.env` accesses.

**Reproduction:** `node --test test/module-registry-source-reader.test.js` on Node 22. Fourteen new focused cases cover native/emitted comparisons (COO/SNO), a deliberately unguarded local property rename, CommonJS process-module aliases, named ESM imports and a non-observing positive-yield control. Additional pre-existing tests cover `process.binding`, loader registry paths and unrelated private-key renaming.

Implementation commits: [dc9ca5e](https://github.com/FlareZ123/obfs/commit/dc9ca5e0e940024d2e48dba482bf8cf91a879f52), [43b815f](https://github.com/FlareZ123/obfs/commit/43b815fb835563634ce64039875f7bcfefa4724a), [bd23c11](https://github.com/FlareZ123/obfs/commit/bd23c110910631f2812a179675c0d9b0c238af99), and [f77b0a8](https://github.com/FlareZ123/obfs/commit/f77b0a8bcbc6cd839aed02c3a28f8bc972697709). Final executable source pinned to `f77b0a8bcbc6cd839aed02c3a28f8bc972697709` on `agent40/node-builtin-source-proof-20261117`.

**Evidence currently available:** The locally installed Node 22.16.0 successfully returned a callable `node:fs.readFileSync` from extracted direct, destructured, reflected and descriptor-obtained `process.getBuiltinModule` references. Both changed JavaScript source files passed V8 parse checks. The multi-platform manual cross-reader workflow was dispatched against the frozen branch; do not mark its differential assertions or JSDoc gates green until the exact run finishes.

## Threat, coverage and cost boundaries

This is a semantic compatibility refusal, not security against an adversary who controls the Node runtime or filesystem. Known source readers can still extract distributed bytes in an instrumented SNO environment; refusing unsafe rewrites preserves exact output but reduces transformable source. No independent attacker-time increase, unauthorized-execution resistance, general static-proof soundness or universal 2.5× performance guarantee is established. Source-reader detection remains a finite syntactic approximation and is not a closed-world proof over arbitrary external libraries, dynamic import indirections, shims or loaders. For a recognized source-observing file, the compiler keeps output bytes intact, so the new preflight does not add obfuscated runtime work. It does add compile-time AST scanning and may reduce private-property-renaming yield. The clean positive control is retained to catch blanket refusal.

Keep this report in `im-results/` unless behavior, independent adversarial cost and broader proof evidence justify promotion.
