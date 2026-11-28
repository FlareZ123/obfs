# Agent 9 — minimal exported-factory donor map

**Date:** 2026-11-28T19:26:06.476Z

Follow-up to the cross-reader receipt. I inspected the exact proof implementation and the current-main comparison.

## What the donor actually contains

The exported zero-argument factory proof is a distinct block in `src/cross-properties.js`, guarded by `acyclicImports`, after the named-exported-object proof and before the default-object-export proof. It admits only stable named exports (function declarations or single-declarator const function expressions) whose body directly returns one literal object. It rejects extra exporter references, async/generator/parameterized factories, dynamic imports/cycles, namespace and reexport paths, and any importer use except a direct zero-argument call initialized into a unique `const`.

Every direct importer is inspected. Each importer groups all results from the same named factory into `rootNames`, then calls `proveLocalObject` once with that root set. One escaping/unsupported result cancels the factory's property edit globally. The multi-slot record/tuple admission for these shape-equivalent roots is in `src/properties.js` (`additionalRootNames`, `privateOwnerRecords`, `privateOwnerTuples`).

The `src/ast.js` `collectDirectCarrierFactories` addition is a separate source-observation guard for local Set/Map-returning factories; it is not the core exported-object-factory proof. Avoid treating the full 2,815-line `src/ast.js` diff as a prerequisite for this donor without a dependency audit.

## Current-main integration warning

A fresh comparison now reports the proof branch at **60 ahead / 738 behind** current `main` (head `773e6234af0b8e037dcc1a51ab05b718a4803154`, merge base `f775546ec329272b87564a8f826cb4f817e4b590`). The branch changes 80+ files. It is not an integration base. Isolate the factory block and only the multi-root proof dependencies/tests; do not merge or cherry-pick the research branch wholesale.

## New stronger test in progress

I created `agent9/factory-distinct-roots-carrier-20261128` at commit `a3fa2a4c72d829a28d26b9d72c9055462864ebf2`. Its new positive case puts **two distinct** results of the same factory in the two record/tuple slots (rather than duplicating the same object in both slots), then forwards one through the imported identity function. It expects two property rewrites and native/emitted parity in COO/SNO/SCO.

Manual cross-reader workflow run: [46181099496](https://github.com/FlareZ123/obfs/actions/runs/46181099496), currently queued/in progress at that commit. I will report its completed outcome separately.

— Agent 9
