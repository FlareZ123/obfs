# Cross-module ESM function arrays as observable source carriers

**Agent 2; 2026-11-17 UTC.** Intermediate safety repair with pinned cross-platform evidence.

## Failure mode

A source-observation check confined to individual files does not see the contents of a named array exported by another module. In a two-module ESM graph:

```javascript
// producer.mjs
export function protectedSum(input) { return (input | 0) + 12; }
export const values = [protectedSum, 'function protectedSum(input){m'];

// entry.mjs
import {values} from './producer.mjs';
values.sort();
```

The native default sort compares the stringified function and the literal sentinel. Source-changing arithmetic lowering in the exporter may change the ordering, despite preserving every direct numeric call. The importer never spells `protectedSum`, so file-local function-bearing array analysis previously missed the observation. Aliased imported arrays, nested arrays, and detached Array.sort invocation are related routes.

## Repair and tests

`src/cross-properties.js` now supplies `collectImportedFunctionArrays`, a static source-provenance pass over directly named local ESM imports. For each module it identifies function declarations / function-valued consts, resolves top-level const arrays and aliases using a fixed point, identifies direct named exports that contain those functions (including nested arrays), then resolves named imports through exact local relative file specifiers. The resulting sets of imported array binding names are passed by `src/core.js` into `observesFunctionSource` in `src/ast.js`. That observer now treats a proved imported function-containing array as a source carrier, including through simple consumer aliases. The cache is skipped when this proof is present.

`test/cross-file-array-source-observation.test.js` includes four negative selected-function cases: direct imported sorted array, nested imported array stringification, alias of imported array, and a detached native sort on the imported receiver. Its positive case exports only `[3,1,2]`, sorts and joins that data in a different module, and requires the unrelated selected function's arithmetic body to remain obfuscatable. Thus a blanket refusal of all Array operations in ESM is not accepted.

- **Red** [workflow 43986493413](https://github.com/FlareZ123/obfs/actions/runs/43986493413), `b7a61211a05b43bbf098101e3f3bdfe2b9dbb23c`, had **4 failures out of 9 tests**, identical on Linux and Windows Node 22; the compiler accepted source-changing transforms in all four function-array cases. The primitive-only positive passed.
- **Repair:** `src/cross-properties.js` `551e5f18ae52f32501028f4ec41ce3c1bb4711ed`; `src/ast.js` `e7d70a0a37aa68a16e420efe420498814c7dd94b`; `src/core.js` `eb3115212705313a9aca0fe17d94160392a50e2d`; JSDoc `99d786e9d9ab925df5d7113ce1892f7e2346fc4d`.
- **Green** [workflow 43986867132](https://github.com/FlareZ123/obfs/actions/runs/43986867132), exact `99d786e9d9ab925df5d7113ce1892f7e2346fc4d`, passed **9/9 tests** on both Linux and Windows plus JSDoc checking.


## Extension: default exports, transitively forwarded exports, and mutations

An independent next batch in `test/cross-file-array-source-observation.test.js` exercised direct named and renamed ESM reexports, `export *`, a two-hop relay, directly exported default array literals, and default const aliases. [Red run 43987211068](https://github.com/FlareZ123/obfs/actions/runs/43987211068) at `6870f34b0edbb6c7ed2c4bcdbba0d5a7378a3664` failed six of 16 tests on Windows and Ubuntu, while preserving an unrelated primitive-only forwarded array positive.

The initial implementation in `src/cross-properties.js` added monotone fixed-point reexport closure and default import classification (`cb3f255ff1abffe9873f855028387176ae59a4e7`). Its first validation [43987381131](https://github.com/FlareZ123/obfs/actions/runs/43987381131) passed all four new reexport tests, while the two default cases exposed an implementation bug: a default-export branch was accidentally inserted in `collectVerifiedImportedStrings`, referencing `hasFunction` out of scope. The bug was repaired in `5aaaf258952f3e9012d8c742c593ec7406c09ed0`. [Run 43987802255](https://github.com/FlareZ123/obfs/actions/runs/43987802255) passed all **16/16** functional cases per platform but then failed strict TypeScript/JSDoc narrowing on an inner reexport closure. This strict-type issue was fixed in `db4c8283dc0d5091a4ba8eda6948e348167a2096`. [Run 43987944637](https://github.com/FlareZ123/obfs/actions/runs/43987944637) was **green on both OS**, proving the full 16/16 and strict JSDoc check.

A subsequent red batch [43988009048](https://github.com/FlareZ123/obfs/actions/runs/43988009048) added six mutations to exported arrays (push, splice, alias, spread, indexed write, and mutation before reexport) that were not yet propagated across the module boundary, and these six cases failed identically on both OS. `collectImportedFunctionArrays` now marks local mutation targets and propagates may-contain status through const aliases and reexport relays, commit `15ecc54e02ae0b5b3f1ac9c848933ee5d8d8c2f3`. [Green 43988087788](https://github.com/FlareZ123/obfs/actions/runs/43988087788) passed **23/23** crossfile tests per OS and strict JSDoc, retaining the primitive-only positive.

The expanded proof is strictly a may-observe closure. When it refuses a source-changing transform, it intentionally sacrifices obfuscation work on that graph rather than risking native output drift. The tests cover particular static graph and mutation patterns; unknown dynamic module resolution, host-written values, and arbitrary higher-order wrapper calls remain unproved.

## Scope

This pass makes a **positive proof only** for particular function-bearing array initializers and direct named imports. It does not fully model `export *` reexports, default exports, opaque factories returning arrays, imported array mutation, or unknown third-party modules. Consequently, it is an improvement in tested semantic preservation, **not a proof of universal source-observer completeness**. Its main runtime cost is zero; compilation scans the file graph. A general solution needs a conservative whole-program effect and owner analysis, including mutation through cross-module aliases and host APIs.

The direct and detached array method cases are documented in [Array source-coercion research](detached-array-source-coercion-2026-11-17.md).
