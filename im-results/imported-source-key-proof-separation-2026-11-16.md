# Imported unrelated constant keys: source observation and field ownership (2026-11-16)

**Status:** intermediate compiler compatibility/coverage repair, not a resistance result.

## Reproduced failure

The existing `test/cross-file-source-byte-reader.test.js` case `a verified imported constant global key retains closed-world mangling` expects a safe `crossFile.properties === 1` for:

```js
// state.mjs
export const key="otherGlobal";
export const state={secretField:23};
// main.mjs
import {state,key} from "./state.mjs";
console.log(state.secretField,globalThis[key]);
```

Agent 48 independently saw `0 !== 1` on Ubuntu and Windows at commits `1501a8fbb95e001aebaf2d5b354690e57634ade6` ([run 43791947182](https://github.com/FlareZ123/obfs/actions/runs/43791947182)) and `2a2811cbec393687f709a93f3fa7ae1fdefbd59a` ([run 43792977075](https://github.com/FlareZ123/obfs/actions/runs/43792977075)). These failures preceded the second candidate's changes to `src/ast.js`.

## Root cause and bounded change

`collectVerifiedImportedStrings(files)` already validates the unique, statically resolved direct ESM import `key` as a constant string `"otherGlobal"`. Both source-observation scanners can therefore distinguish this key from a dynamic browser source reader.

However, the cross-file ownership proof passed only `importedKeys` assembled from `earlierKeyExports`: strings equal to one of the owner's own fields and initialized before that owner. This narrower map is necessary for sound **property rewriting**, especially in cyclic ESM initializations, but insufficient for classifying **unrelated source observation**. The scanner inside `proveLocalObject` received an empty map, interpreted `globalThis[key]` as an unknown dynamic global read and rejected the otherwise proven field rewrite.

The repair separates the two proof purposes:
- `src/properties.js`: `proveLocalObject` accepts a seventh optional `importedSourceKeys` map solely for `observesFunctionSource`, defaulting to the original `importedConstantKeys` for unchanged callers.
- `src/cross-properties.js`: importer analysis passes `verifiedStrings.get(importerName)` as the source-observation map and retains `importedKeys` as the strict owner-member map.

Thus a verified `"otherGlobal"` no longer blocks renaming `secretField`; an unknown or source-reader key still blocks through the existing global guards. No expanded alias forwarding, dynamic-key rewriting, or ESM initialization claim is made.

## Reproduction and regression tests

`test/imported-constant-computed-key.test.js` adds:
1. A benign unrelated imported global key declared **after** the exported owner: expected 1 renamed private field.
2. A benign unrelated key from a **different** ESM module: expected 1 renamed private field.
3. An imported `"fetch"` key that remains browser source-reader-sensitive: expected 0 renamed private fields.

All run their original and generated ESM graphs through the Node executable and compare process observations. The earlier same-exporter positive case in `test/cross-file-source-byte-reader.test.js` also passes.

**Pinned full targeted transformation-safety run:** [43796941000](https://github.com/FlareZ123/obfs/actions/runs/43796941000) at **`06a421df21dfae34087b04f1a360a455f0423b0e`**, Ubuntu Node 22 **passed** and Windows Node 22 **passed**. It includes root JSDoc and external-tool typechecks, source-observer/property semantic suites, imported-key ESM fuzz and samples, observed coverage diagnostics, and selected hot-loop profiles. This is not the separate full `manual-validation.yml` release gate and does not certify later HEAD.

## Limits and next work

The proof is intentionally syntax-bound and assumes the explicit closed-world ESM graph. Opaque loaders, runtime instrumentation, hostile globals, user-selected alternate module resolutions, and dynamic code are outside this positive coverage. Every published hashed property name remains available to static normalizers; the patch adds compiler correctness/coverage and **no measured deobfuscation resistance**.

Suggested follow-up: independently challenge earlier-vs-later ESM imported keys through cyclic module graphs, source introspection, and whole-session cold/hot application measurements.