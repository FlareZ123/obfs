# Ambient function-receiver provenance, a falsified unsafe-rewrite hypothesis

**Date:** 2026-11-18. **Classification:** Intermediate, source-pinned negative-control audit. This investigation did not identify a new unsafe compiler rewrite or improve resistance to a hostile client.

## Hypothesis

An ordinary function can receive `globalThis` via `Function.prototype.call`, `.apply`, `.bind`, or `Reflect.apply`. Its `this` binding could then reach the ambient `Reflect` object through an opaque computed selector, replace `Reflect.ownKeys`, and cause an undeclared host callback to dynamically import a previously renamed ESM owner. If the compiler missed this route, native and emitted own-key observations would differ.

The executable test is [`test/closed-record-this-arg-ambient.test.js`](../test/closed-record-this-arg-ambient.test.js). It preserves three native ESM files and gives both native and emitted processes the same external Node preloader. Five source-visible receiver-transfer variants must all **decline** exported `secretField` rewriting. The original printed output is `[41,"audit-v1",["secretField"]]`. A separately constructed reader graph with no ambiguous receiver expression must retain exactly **one** genuine private-key rewrite and native/emitted parity. The test covers one static ownership configuration and its five adversarial variations.

## Red baseline was a test-design error

The unmodified compiler under source `87d5bac541782d89a2c2fbfb87aa16c83cefb844` passed **all five hostile receiver cases**. Its Ubuntu [manual-validation run 44306666803](https://github.com/FlareZ123/obfs/actions/runs/44306666803) reported 3,345 passes, one skip and **one failure** out of 3,347 tests. The failing test wrongly demanded one property rename *inside the same graph containing `this[selector]`*. That unproved computed member correctly invalidated the compiler's outer closed-world graph proof. The Windows job likewise reported a behavioral suite failure; its specific failure must be inspected independently before attributing an exact count.

An experimental `safeClosedCallerRecordRead` receiver-transfer guard was added at `5ec25c3e814fa9b159416ef0111ffc31ed7ed2ed`, but the observed negative cases had already passed. The guard was therefore **reverted** in `d55cc5943bd5713bcf078c16050d92fd8a5c3e4e`. It has no established safety or security benefit. The revised positive fixture omits the ambiguous `this[selector]` path, and now measures owner-rewrite yield on a separately eligible graph. This mirrors the explicit `closedWorld` / trusted-realm premises in [the property proof contract](../docs/CLOSED_WORLD_PROPERTY_PROOF.md).

## Validation and implications

The revised no-source-change test and targeted workflow edit are pinned at executable source `495024f862d92ddf4b2a8a570ea8d34ce665f67a`. A first [Ubuntu/Windows full integration 44308204421](https://github.com/FlareZ123/obfs/actions/runs/44308204421) completed successfully on both systems at executable source `495024f862d92ddf4b2a8a570ea8d34ce665f67a`. After reconciling newer main, [full manual-validation 44309705169](https://github.com/FlareZ123/obfs/actions/runs/44309705169) and [manual transformation semantics 44310430050](https://github.com/FlareZ123/obfs/actions/runs/44310430050) **both completed successfully on Ubuntu and Windows** at integrated executable source `ef9bf031874c15b73617b8a4d7e71fe8c6094033`. These runs include the six-case regression, strict JSDoc, benchmark fixtures and real Ubuntu Chromium coverage.

This audit demonstrates that the existing global computed-property guard covers the five tested receiver pathways, at the cost of refusing some otherwise unrelated private object rewrites. A zero-rewrite graph is a legitimate semantic refusal and **cannot** be credited as protected code. The independent reviewer-model service failed with `UNAVAILABLE` / HTTP 404, so no new anti-LLM reconstruction evidence exists from this invocation. The repository's primary strong-protection release decision remains blocked.

**Next research:** Use a narrower, proved constant receiver/key or a separate runtime provenance model to search for actual native/emitted differences, with a nonvacuous eligible control and an exact source-pinned red result before modifying compiler guards. Avoid claiming security from defensive refusal or from a known static recovery script alone.
