# Generation-qualified source edit map prototype

**Owner:** Agent 3  
**Date:** 2026-11-24  
**Status:** intermediate implementation evidence; not a source-observer candidate or release claim

## Decision

Select **generation-qualified composed source edit maps** (Agent 24's strategy B). Keep the immutable `SourceObservationPlan` tied to its original `SourceUnitRef` and `sourceGeneration`. Do not attempt text-similarity node-ID restoration or refactor every transform into one original-source edit set.

The map chain is a separate pipeline proof. Each pass maps a protected original span into the next exact source generation. A consumer must reparse the new generation, mint a new `SourceSpanRef`, and rebuild or validate semantic graph identities. A positional map alone is never evidence that a BindingRef, DefinitionRef, CallSiteRef, ModuleResolutionEdge, ValueFlowEdge, or HostEffectRecord remains valid.

## Repository implementation

Current-main-based branch: `agent3/source-edit-map-20261124`  
Base main SHA: `3d148a9f6407f357ae481d5d8196ae606f86cd17`  
Initial implementation/test head: `741b42bf8459b6d3d505ee2bd6b83019380f3843`  
Current implementation/test head: `f2df04a89201f91659dd2b7aab24b530d0854326`  
Documentation head before this update: `348410f145fc465725d191bf0204dd41a01d9711`

Files:
- `src/source-edit-map.js` — `sourceGenerationOf`, `applyEditsWithMap`, and `mapSourceSpan`.
- `test/source-edit-map.test.js` — focused boundary, identity, generation-chain, UTF-16 and deterministic tests.

The prototype:
- qualifies each map by an opaque `SourceUnitRefKey`, parser contract, exact from/to source generation, and `utf16-code-unit` offsets;
- computes each parser-input generation from the parser contract plus exact JavaScript UTF-16 code units (UTF-16LE digest), preserving isolated surrogates without lossy UTF-8 normalization;
- derives the canonical parser contract beside `parse()` from the installed Acorn version and the exact shared parse-option object for script/module/commonjs;
- retains `originSpanId` in a relocated range as an association only, without minting a new SourceSpanRef;
- preserves the exact output semantics of existing `applyEdits`, including same-offset insertion ordering;
- distinguishes unchanged, replaced, deleted and inserted segments;
- requires explicit `before-node` affinity for an insertion exactly at a protected span's start; unknown or within-node affinity fails closed;
- rejects replacement/deletion overlap, interior insertion, stale source generation, and wrong source-unit identity;
- compares the final source slice with the original slice after relocation;
- requires a response-scoped opaque SourceUnitRefKey; a test proves that identical bytes/generations from two SCO GET response instances cannot share a map;
- includes zero-width span boundary tests at replacement/deletion starts, ends and interiors;
- returns a relocated range only, not a fabricated new `SourceSpanRef`.

The parser contract identifier supplied by the caller must include the actual parser version, source type and parse options (currently Acorn, `ecmaVersion: latest`, `allowReturnOutsideFunction`, `allowHashBang`, and `preserveParens`). The source-unit key must identify the runtime module/script instance, not merely a file path. For SCO it must be response-specific, so concurrent GET variants cannot share a mutable map or unit identity.

## Validation

Latest focused map run [45345729557](https://github.com/FlareZ123/obfs/actions/runs/45345729557) and transform-consumer run [45345735003](https://github.com/FlareZ123/obfs/actions/runs/45345735003) passed on Ubuntu and Windows, Node 22.23.4:
- 17 focused map tests passed, including parser-contract identity, lone high/low surrogate separation, response-scoped SourceUnitRef isolation, zero-width replacement/deletion boundaries, and 10,000 deterministic span checks;
- 2 transform integration tests passed, including the hostile-host `queueMicrotask`/`Function#toString` capture and the unprotected red control;
- project JSDoc, external JSDoc and paired/complete-suite budget evaluator JSDoc passed.

Both focused workflows intentionally skipped the comprehensive `node22` job. This is not a full-suite or release acceptance receipt.

The deterministic test executes 500 seeded edit sets and 20 sampled spans per set (10,000 span checks), including an astral character before edited ranges. Earlier focused runs exposed a zero-width-span boundary bug; the implementation now maps an empty span consistently using right bias at an explicitly before-node insertion. Agent 50 also found a UTF-8/lone-surrogate generation collision; the digest was changed to lossless UTF-16LE and regression-tested.

The prototype reuses and extends Agent 1's existing `sims/utf16-edit-map-reference.js` / `sims/utf16-edit-map-reference.test.js` rather than duplicating that reference work. Agent 24's original-span report and Agent 50's 06:10/06:30 reviews supply the generation, affinity, semantic-invalidation and effect-separation requirements.

## First real consumer slice

`renameLocalIdentifiers` now optionally emits a generation-qualified map and skips identifiers overlapping validated protected SourceSpanRefs. `encodeStrings` now optionally emits a map including its generated decoder prologue and skips string literals overlapping validated protected spans. Both validate source-unit and parser-generation identity before accepting the spans. A transform-level test builds a callback span, maps it through identifier rewriting, reparses/rebuilds the current span, then protects it through string encoding while still encoding an unrelated top-level literal. A sandboxed hostile `queueMicrotask` reads `Function#toString` and sees the exact original callback source. The red control omits the protected span and proves the host observes mutated callback source. This is a real two-pass consumer witness, but the plan is manually supplied in the test; the canonical plan producer and core wiring remain absent.

The UTF-16LE generation is the identity of the parser's actual JS string input plus parser contract. If a SourceBytes effect needs original file-byte identity, SourceUnitRef must additionally bind the raw-byte digest and decoder contract; this map does not reconstruct raw input bytes from an already-decoded string.

## Required integration contract

1. **One immutable plan producer.** Build the complete cross-file source-observation graph once per exact source-unit group. Every `SourceSpanRef` is qualified by the actual source-unit instance, parser-qualified generation and UTF-16 offsets.
2. **One map per pass and source unit.** The core pipeline must carry the per-unit map chain across cross-property, local-property, identifier, string and any enabled experimental transforms. A pass that cannot emit a complete map must decline the affected source-observation transformation.
3. **Generated source is part of the map.** Include string decoder prologues, VM helpers, Wasm initializers, appended helpers, host-lock wrappers and every other post-`applyEdits` insertion. A central `applyEditsWithMap` call does not account for source inserted afterward.
4. **Semantic proof is separate.** If a pass touches identifiers, property keys, calls, module specifiers or any graph-supporting syntax, it must provide a pass-specific semantic-preservation proof or invalidate/recompute affected graph edges. Position mapping cannot preserve stale semantics.
5. **Effects stay separate.** ExactSource can be span-local only after exact-slice verification. SourceBytes invalidates on any source-unit byte change. FramePosition needs its own stable-callsite position map and cumulative padding accounting. CallableMetadata remains independent.
6. **SCO is two-phase and per response.** A full-graph base analysis must filter candidate `varyLiteralSpellings` edits before application. Each response then gets its own exact generation, source-unit identity, edit map and immutable full-graph response plan; the later single-file `obfuscateFiles([input])` call must receive that full-graph plan rather than rebuild a one-file graph. Concurrent requests share no mutable plan/map.
7. **Rebuild AST identities.** After mapping a range, reparse the exact current generation and reconstruct the current `SourceSpanRef`, BindingRef/DefinitionRef/CallSiteRef and effect links before any later pass consumes them.

## Release decision

**NO-GO / RELEASE-BLOCKED.** This branch contains only a positional mapping primitive and focused tests. No compiler transform consumes it; there is still no immutable SourceObservationPlan producer, no complete semantic-preservation/invalidation protocol, no candidate branch integrating COO + actual SCO request-time + actual SNO CLI/launcher, and no comprehensive current-head acceptance.

Smallest next obligations:
- implement the single plan producer and typed per-pass semantic invalidation contract;
- wire maps through every enabled source-mutating consumer, including generated helper/prologue insertions;
- make the SCO base-analysis / per-response full-graph plan lifecycle explicit;
- turn the existing COO, SCO, SNO and unrelated-positive-yield red controls into candidate-based green tests;
- run one source-pinned comprehensive behavior/compatibility gate, then hostile-runtime reconstruction/tamper/environment-lock evaluations and matched 2.5x whole-workload measurements.

Do not treat this prototype or its focused green receipt as evidence of static/dynamic resistance, tamper resistance, environment locking, or runtime-budget compliance.
