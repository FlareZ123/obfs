# Agent 10: current WeakMap candidate review — source-sink correction and two scope falsifiers

**Date:** 2026-11-26T19:54Z  
**Candidate reviewed:** `agent1/weakmap-exported-container-review-20261126` at `fcec2e0d99e909e43433b18cacb63f9fba37b31e`.

## Important correction to the latest focused failure

Run **45885076156** fails `test/agent4-weakmap-subclass-own-parent-control.test.js` on all three OSes, but the failing fixture only mutates the parent of a shadowed derived `WeakMap.prototype`; it never passes a function through a source-observation sink. It asserts `observesFunctionSource === true` for prototype exposure alone. That assertion is at the wrong layer: `hasWeakMapPrototypeExposure` is the lower-level capability fact consumed by the reference-only Storage proof. The test should assert that helper directly or include the source sink. This run does **not** by itself prove the latest candidate still has the source-observer false-safe.

A proper cross-file source-capture replay already exists on Agent 6's branch:
`test/agent6-weakmap-subclass-base-prototype.test.js` at `65709f0abd806d703abf05af3d0a9dae90966656`. It mutates the shared native prototype, then reaches a DOMString-compatible `document.title` sink through a sibling module's reference-only Storage override. It asserts group exposure, zero Storage-module binding rewrites, and exact captured-source parity. Its older donor runs are red; it needs to be replayed against the current Agent 1 candidate head before declaring the gap open or closed.

## Two code-derived falsifiers for the current name-keyed CarrierValue pass

These are **test proposals, not runtime receipts**. Both can reuse the Agent 6 sibling Storage/entry modules and should be added as variants to the same candidate funnel.

1. **Nested same-name class collision.** The heritage prepass walks all class declarations but stores `weakMapDerivedConstructors` by `node.id.name`. A top-level `class Derived extends globalThis.WeakMap {}` followed by an unrelated function-local `class Parent extends globalThis.WeakMap {}; class Derived extends Parent {}` overwrites the outer `Derived` depth (1) with the nested depth (2). The top-level `Object.getPrototypeOf(Derived.prototype)` may then be treated as an intermediate rather than native WeakMap prototype.

2. **Block-scope carrier shadow.** `visitCarrierStatement` recurses through `Program` / `BlockStatement` using the same `Map<string,CarrierValue>`. A top-level `const carrier={instance:new WeakMap()}` followed by a block-local `const carrier={}` overwrites the outer carrier state. A later top-level `Object.getPrototypeOf(carrier.instance)` sees the empty inner record in the analysis environment, even though JavaScript resolves the outer record.

A related control-flow proposal is a carrier assignment inside `try { carrier = {instance:new WeakMap()}; }` followed by a prototype read after the try. The current `TryStatement` visitor analyzes the try/catch in cloned environments but does not join them back into the parent, so normal-path state can be lost.

## Architecture boundary

I compared the candidate with the shared carrier/effect contract, Agent 3's integration proposal, and Agent 4's WeakMap bridge. The current helper is a bounded local analysis, not the shared model: it uses spelling-keyed maps/sets and returns a module/group-level boolean; it does not consume canonical BindingIds/ValueRefs or emit HostEffectRecords, per-sink spans, or canonical FunctionSummaries. I recommend **not** grafting the whole shared graph into this branch or adding more parallel resolvers. Keep this as a temporary, explicitly bounded fail-closed WeakMap veto only if unknown/shadowed/reassigned/control-flow cases cannot become negative proofs. Long-term integration should attach WeakMap facts and NativePrototypeRead/Mutation/PrototypeEscape edges to the shared graph, with the actual source sink represented separately.

No candidate branch or PR was created by this review. Agent 1 has been sent the detailed test proposals and contract comparison.

— Agent 10
