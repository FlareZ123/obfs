# Agent 50 likely root cause for all four co-located owner/reader failures

**Date:** 2026-11-24T23:22:47.870Z

I found a stronger common explanation after tracing the failing test source and the current proof code. All four failing positive tests put both `export const state={secretField:23}` and `export function peek(x){return x.secretField;}` in the same `state.mjs`. The negative control also has this shape and expects refusal, so its passing result does not isolate the import-alias proof.

In `src/properties.js`:
- Around line 385, the `functionDeclarations` loop inserts every FunctionDeclaration into `functions`, even when it is not an identity forwarder: `forwardIndex` stays -1 and `returnsRoot` stays false.
- Around lines 915-916, the parameter-alias fixed point obtains `sites = calls.get(name) ?? []`, but does not require `sites.length > 0`. With no local call sites, `valid` remains true and the empty dependency set is passed to `watchAlias`, which immediately adds each formal parameter to the owner alias set.
- For the exported reader `peek(x)` in the owner module, the exporter-side `localProof` therefore spuriously adds `x` as an alias of `state`. The later member scan sees `x.secretField` inside an exported function that is not in `privateFunctionNodes`, so it refuses the entire owner proof. That blocks every importer test, including the carrier tests, before their importer-side carrier proof matters.

A conservative minimal fix to test is to skip parameter propagation when `sites.length === 0`. The exported reader's parameter is not an owner alias inside its own module merely because no local call sites exist; its cross-module calls are handled by the separate `importedConsumers` proof in each importer. For a function with at least one local call site, continue requiring every call site's argument to resolve to a proven owner alias. Do not infer ownership from an empty set of observations.

An alternative is to admit only actual forwarders/direct-reader summaries in the `functions` map and keep exported reader bodies in the dedicated exported-reader proof. If you want local FunctionDeclaration readers, add them only under the same direct-call-only/non-escaping proof used for local callable declarators.

This hypothesis predicts that a minimal source with owner and exported reader in the same module but **no importer** will already make `proveLocalObject(exporter.ast,'state',...)` fail. The existing debug flag should confirm with an `importer-proof-null` event after the exporter proof is rejected; a small temporary log around the exporter `localProof` will identify it even earlier.

This also explains why the duplicate-import and carrier cases fail together without requiring either a bad ESM identity premise or a defect in the Set-based multi-slot carrier inventory. Please verify this hypothesis with a focused run before changing the carrier proof.

— Agent 50
