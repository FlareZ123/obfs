# Alternative Node loader source-byte observation: paired differential

**Date:** 2026-11-16  
**Agent:** 30  
**Status:** bounded compiler compatibility repair; intermediate software evidence

## Question and native witness

A program can obtain Node's filesystem module without spelling a direct
`require('fs')` call or importing `node:fs`. In a CommonJS entry point:

```js
const io=module.require("node:fs");
const source=io.readFileSync(__filename,"utf8");
const state={secretField:31};
const key=["secret","Field"].join("");
console.log(state.secretField,source.includes(key));
```

Native Node 22 prints `31 true`. A compiler that renames the owned key,
renames local variables, or rewrites the two string fragments can change the
byte-level source inspection even if the numeric result remains 31.

Five CommonJS loader routes are tested:

1. `module.require('node:fs')`
2. `require.main.require('node:fs')`
3. `process.mainModule.require('node:fs')`
4. `module.constructor._load('node:fs')`
5. `module.constructor.createRequire(__filename)('node:fs')`

Three ESM fixtures exercise named `createRequire` from `node:module`,
default `Module.createRequire` from `module`, and `Module._load` from
`node:module`, each with an actual `readFileSync` of `state.mjs`.
Those three ESM fixtures already passed under the prepatch compiler, so
they are retained as differential regression coverage rather than claimed
as newly repaired failures.

## Paired outcome on the exact tested source

- **Unpatched negative control** commit
  [`701d94f`](https://github.com/FlareZ123/obfs/commit/701d94f930b0f6acfdf4732eb52ef686aa833815),
  [cross-platform run 43783800891](https://github.com/FlareZ123/obfs/actions/runs/43783800891):
  each operating system recorded **76 passed / 5 failed** among 81 tests.
  All five failures are the independent CommonJS source-read fixtures:
  original emitted `31 true` while compiler-transformed execution emitted
  `31 false`, with successful process exit in both cases. The source-only
  output also showed identifier, property and string rewrites. This is a
  demonstrated observable incompatibility, beyond changed source formatting.
- **Guarded candidate** commit
  [`643b4ac`](https://github.com/FlareZ123/obfs/commit/643b4ac642b6726cc3c2ef1186cc4a6751098b01),
  [cross-platform run 43783805653](https://github.com/FlareZ123/obfs/actions/runs/43783805653):
  the same 81-test cross-file batch and strict JSDoc typecheck passed on both
  Ubuntu Node 22 and Windows Node 22. The compiler now leaves the eight
  original fixtures unmodified and matches their native stdout/stderr/status.
  This does not establish equivalence for untested loader patterns.

The negative-control branch changed only the test and targeted workflow from
the earlier source. The candidate includes the guard, the same test, the
workflow selection, and an explanation in `docs/SECURITY.md`.

## Implementation and trade-off

`src/ast.js` `observesDistributedSource` extends its existing filesystem
source-reader guard to `module`/`node:module` import, reexport, dynamic
import, and direct `require()` paths. It also recognizes the bounded
CommonJS member-loader shapes above, including the `module.constructor`
escape. `src/core.js` already refuses downstream property, identifier,
and string rewrites for a source group when this preflight returns true.

This repair intentionally sacrifices some coverage: benign
`node:module` imports, `module.constructor` references and direct
module-require member references can be refused even when no source read
occurs. Unknown loader aliases, dynamically computed module identifiers,
custom filesystem hooks, external preprocessing and runtime source
observation remain outside this bounded AST proof. Full-control
static/dynamic attackers can still reconstruct public obfuscated code;
these tests establish semantic compatibility for the specified fixtures,
not deobfuscation resistance.

## Reproduction

On the respective pinned branches, run
`npm install --no-package-lock --ignore-scripts`, then
`node --test test/node-loader-source-reader.test.js` and
`npm run typecheck`. The checked-in `manual-cross-readers.yml` workflow
runs these with other cross-file semantic regressions on Linux and Windows.
