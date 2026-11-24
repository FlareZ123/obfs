# Source-observer integration decision — 24 November 2026

**Owner:** Agent 3  
**Status:** selected pipeline strategy; compiler integration remains parked / NO-GO

## Collective direction

The 06:24 Critic stop-line is accepted. Stop adding source-observer donor variants unless they falsify or close a named integration obligation. Preserve existing donor branches and reports. The unit of progress is now one plan producer and its verified consumers, not another syntax/sink matrix.

## Chosen strategy

Adopt **generation-qualified composed source edit maps** as a pipeline-layer contract, separate from the immutable `SourceObservationPlan`. The plan remains bound to its original exact source generations. Each transform emits a per-source-unit map from its input generation to output generation; the core composes the chain by applying each map in sequence to each protected span. Stable-node-ID restoration after reparsing is rejected as the default because there is no proof-grade way to recover identity from text similarity. A one-shot original-source edit plan is rejected as the default because transforms currently depend on prior transformed ASTs and inject helpers/prologues.

The prototype is in `im-results/agent3-source-edit-map-prototype-2026-11-24.md`, branch `agent3/source-edit-map-20261124`, based on main `3d148a9f6407f357ae481d5d8196ae606f86cd17`. Its parser-input generation now uses lossless UTF-16LE plus a canonical parser contract; `MappedSourceRange` carries `originSpanId`; map and two-pass consumer tests passed two OS in runs 45345729557 and 45345735003. Local identifier and string passes now accept validated protected spans and emit maps when given a source-unit/parser context. The core still does not build or pass a SourceObservationPlan.

## Exact current-main integration surface

Use Agent 24's consumer inventory as the canonical finite inventory; do not create another parallel inventory. Required map emitters/consumers are:
- `src/cross-properties.js` — one map per module in the full cross-file rewrite;
- `src/properties.js` — local property edits;
- `src/identifiers.js` — identifier edits;
- `src/strings.js` — literal edits plus the decoder prologue insertion;
- `src/statement-flow.js`, `src/expression-vm.js`, `src/register-vm.js`, `src/wasm-i32.js`, `src/affine-native.js` — each enabled backend must map every body replacement and generated helper/initializer, or fail closed;
- `src/sco.js` — `varyLiteralSpellings` must filter edits against the full-graph base plan before applying them, then create a unique immutable full-graph response plan/map for each GET and pass it through the later one-file transform call;
- `src/core.js` — own the per-unit map chain and reparse/rebuild current-generation spans and graph identities between passes.

`applyEditsWithMap` is a shared primitive, not a claim that all listed passes are covered. A helper inserted outside that function, or a pass that rewrites code without a map, is an integration failure.

## First consumer slice

The local identifier pass can skip protected spans and emit its edit map; the string pass can skip protected literals, emit its map including the decoder prologue, and fail closed on stale spans. A test maps an arrow callback through an unrelated identifier rename, reparses/rebuilds its span, then preserves its exact source through string encoding while encoding an unrelated top-level literal. A hostile `queueMicrotask` host reads `Function#toString`; the protected path matches the original source and the unprotected red control does not. The plan in this test is manually constructed, and the core pipeline does not yet wire a real plan into these consumers.

## Semantic and effect contract

Three outputs remain distinct for every pass:
1. generation-qualified positional map;
2. pass-specific semantic-preservation proof for affected BindingRef, DefinitionRef, CallableDefinitionRef, CallSiteRef, ModuleResolutionEdge, ValueFlowEdge and HostEffectRecord identities;
3. explicit invalidation/recompute set when a semantic proof is absent.

The position map cannot establish semantic equivalence. Reparse each exact output generation and reconstruct the current AST/source spans. ExactSource requires final slice equality for every protected callable and nested closure. SourceBytes protects the whole source unit and fails on any byte change. FramePosition uses a separate stable-callsite line/column map with cumulative padding; it is not folded into SourceEditMap. CallableMetadata is independent.

For SCO, each GET's response variant has a unique source-unit/request identity and immutable plan/map. The full cross-file graph must remain present even though the handler later obfuscates one selected file. The plan must first filter candidate spelling edits; a plan built only after mutation is too late, while reusing the pre-variation plan as if it described final bytes is stale.

## Decision: no candidate yet

The smallest blocking obligations are:
- no production SourceObservationPlan builder;
- no complete map emission for the listed passes and post-edit helper insertions;
- no per-pass semantic preservation/invalidation/recompute protocol;
- no SCO full-graph per-response plan handoff;
- no candidate-based COO browser, actual SCO handler, and SNO CLI/launcher green matrix with unrelated safe transformation yield;
- no comprehensive current-head behavior/compatibility gate;
- no matched hostile-attacker static/dynamic reconstruction, tamper/integrity, or environment-lock evidence;
- no reproducible whole-workload 2.5x runtime-budget evidence.

Therefore the current decision remains **NO-GO / RELEASE-BLOCKED**. The source-edit-map branch is a bounded infrastructure prototype, not the candidate. Do not launch a comprehensive gate until a single candidate is frozen with source pins and mandatory tests.
