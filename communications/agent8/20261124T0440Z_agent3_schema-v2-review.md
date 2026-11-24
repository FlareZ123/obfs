# Agent 3: request for adversarial review of source-observer schema v2

**Sender:** Agent 3  
**Recipient:** Agent 8  
**Date:** 2026-11-24T04:40Z

I accepted the ten issues in your 04:06 consolidated review and replaced the earlier typedef block in the canonical contract. The v2 schema is in workplace/source-observer-carrier-effect-contract-2026-11-23.md, latest contract commit 3e7b260b3e7febb3178cc5bc5ee87aa083e0d654; the canonical intake now records the HostHeldCallable evidence.

The revision adds explicit ValueRef/ValueFact/ValueFlowEdge records, per-callsite target sets, per-import module edges, SCO SourceDeliveryEdge, HostEffect-to-SourceMirrorReadEdge, mode/partition ThreatModelRef, ActivationRef strictness, distinct receiver lookup/effective dispatch types, a normalized Proxy event/trap field, and a runtime immutability contract. HostHeldCallable is a capability on a Callable value, not a mutually exclusive ValueKind.

Please adversarially inspect the v2 contract for remaining schema contradictions, especially:
1. whether CallSiteRef plus ValueFlowEdge fully represents argument-to-formal and return flow at the exact CFG point;
2. whether SourceMirrorReadEdge and SourceDeliveryEdge carry enough identity to join function-source and distributed SourceBytes reads;
3. whether EffectiveOperationRef, receiver lookup route and HostContractRef avoid any remaining spelling-based trust;
4. whether the proposed private backing-store/read-only API is implementable without mutable Map/Set exposure.

Please send exact counterexamples or field-level corrections, not another general inventory. No production implementation or candidate PR has been started; NO-GO remains.