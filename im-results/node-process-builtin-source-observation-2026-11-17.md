# Node process built-in module source-observation boundary (17 November 2026)

**Status: implementation committed and Node API / V8 syntax checks completed. Cross-platform regression and JSDoc validation queued on frozen SHA `52b52b27bf3cdfa4550c7e0cac44bf29153a97e8`; results remain provisional. Intermediate compatibility evidence only.**

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

**Reproduction:** `node --test test/module-registry-source-reader.test.js` on Node 22. Fourteen new focused cases at the frozen executable SHA cover native/emitted comparisons (COO/SNO), a deliberately unguarded local property rename, CommonJS process-module aliases, named ESM imports and a non-observing positive-yield control. A fifteenth cross-file ESM native-versus-COO regression was added later in commit [209fce8](https://github.com/FlareZ123/obfs/commit/209fce8ca6b2153f8626d43f049ef55192a0b03d), after the frozen workflow dispatch; it remains separately unverified. Additional pre-existing tests cover `process.binding`, loader registry paths and unrelated private-key renaming.

Implementation commits: [dc9ca5e](https://github.com/FlareZ123/obfs/commit/dc9ca5e0e940024d2e48dba482bf8cf91a879f52), [43b815f](https://github.com/FlareZ123/obfs/commit/43b815fb835563634ce64039875f7bcfefa4724a), [bd23c11](https://github.com/FlareZ123/obfs/commit/bd23c110910631f2812a179675c0d9b0c238af99), and [f77b0a8](https://github.com/FlareZ123/obfs/commit/f77b0a8bcbc6cd839aed02c3a28f8bc972697709). Final executable source pinned to `f77b0a8bcbc6cd839aed02c3a28f8bc972697709` on `agent40/node-builtin-source-proof-20261117`.

**Evidence currently available:** The locally installed Node 22.16.0 successfully returned a callable `node:fs.readFileSync` from extracted direct, destructured, reflected and descriptor-obtained `process.getBuiltinModule` references. Both changed JavaScript source files passed V8 parse checks. The multi-platform manual cross-reader workflow was dispatched against the frozen branch; do not mark its differential assertions or JSDoc gates green until the exact run finishes.

## Threat, coverage and cost boundaries

This is a semantic compatibility refusal, not security against an adversary who controls the Node runtime or filesystem. Known source readers can still extract distributed bytes in an instrumented SNO environment; refusing unsafe rewrites preserves exact output but reduces transformable source. No independent attacker-time increase, unauthorized-execution resistance, general static-proof soundness or universal 2.5× performance guarantee is established. Source-reader detection remains a finite syntactic approximation and is not a closed-world proof over arbitrary external libraries, dynamic import indirections, shims or loaders. For a recognized source-observing file, the compiler keeps output bytes intact, so the new preflight does not add obfuscated runtime work. It does add compile-time AST scanning and may reduce private-property-renaming yield. The clean positive control is retained to catch blanket refusal.


## Additional independently scoped alias cases (08:59 UTC)

Subsequent source and regression commits, after the original 14-test freeze:

- [209fce8](https://github.com/FlareZ123/obfs/commit/209fce8ca6b2153f8626d43f049ef55192a0b03d) adds a cross-file native ESM source observer and protects the unmodified owner module.
- [8695b36](https://github.com/FlareZ123/obfs/commit/8695b367b95256784a7093ee2dfb4fa96fdc4b9e) recognizes named/star reexports of Node process loader methods. One benign `env` reexport remains eligible for local private-field renaming. Three new cases.
- [47eda0a](https://github.com/FlareZ123/obfs/commit/47eda0a4bbbbd42121c1b194c8a85011e65694af) recognizes dynamic `import('process')` and `import('node:process')` as a potentially source-capable boundary. Includes a benign `node:os` dynamic import positive control. Three new cases.
- [52b52b2](https://github.com/FlareZ123/obfs/commit/52b52b27bf3cdfa4550c7e0cac44bf29153a97e8) recognizes detached and simply aliased `Reflect.get` / `Object.getOwnPropertyDescriptor` methods. Includes a benign detached `process.env` reflection positive control. Five new cases.

That yields **26** added test cases since the original module-registry source reader suite: 14 initial + 1 cross-file + 3 ESM reexports + 3 dynamic imports + 5 detached reflection. They are executable assertions, not yet reported as passing on CI.

Earlier CI runs [44048301399](https://github.com/FlareZ123/obfs/actions/runs/44048301399) and [44048988081](https://github.com/FlareZ123/obfs/actions/runs/44048988081) were cancelled while queued because subsequent revisions superseded their executable SHAs. The current consolidated [cross-reader Linux/Windows run 44051289988](https://github.com/FlareZ123/obfs/actions/runs/44051289988) was queued at last inspection at exact executable `52b52b27bf3cdfa4550c7e0cac44bf29153a97e8`, branch `agent40/node-process-reflection-proof-20261117`. Do not treat a queued run as validation.

Native Node 22.16.0 API probes confirmed extracted `Reflect.get` and `Object.getOwnPropertyDescriptor` functions can retrieve callable `process.getBuiltinModule`. The latest fetched `src/ast.js` and test module successfully parsed as JavaScript in the local V8 engine, without executing the repository's compiler. Compiler behavior, native differential assertions and strict JSDoc remain dependent on CI.

Keep this report in `im-results/` unless behavior, independent adversarial cost and broader proof evidence justify promotion.
