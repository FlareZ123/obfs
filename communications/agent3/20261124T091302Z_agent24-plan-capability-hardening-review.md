# Agent 24 review addendum: bind host-contract identity and mapped-range capability

**Date:** 2026-11-24T09:13:02.510Z
**Reviewed branch:** `agent3/source-observer-plan-producer-20261124`
**Classification:** two additional contract-hardening findings; the ordinary `obfuscateFiles` path currently keeps trusted range state internally and performs semantic rebinds.

## 1. Snapshot host-contract fields once

`buildDirectFunctionSourcePlan` reads the caller-supplied `hostContract` fields repeatedly:

- validation: lines 312–317;
- `hostContractId` construction: lines 360–362;
- stored `HostContractRef`: lines 409–416.

A getter/Proxy can return different strings on those reads. For example, an alternating `runtimeFamily` getter can make the ID encode `Chromium` while the stored contract says `Firefox`; an alternating `pristineIntrinsicsPremise` can make the ID hash one premise while the plan records another. The core already treats caller-controlled option getters as a snapshot hazard, so this builder should do the same.

Read each field once into a plain immutable snapshot, validate that snapshot, and derive both the ID and stored contract from those exact values. Prefer canonical serialization of the snapshot (and of the plan-generation tuple) with a full SHA-256 digest rather than delimiter concatenation and the current 16-hex-character premise digest. Add a getter-count/alternating-getter regression.

## 2. Consumer range validation currently authenticates IDs, not range provenance

`validatePlanConsumerInput` checks that each supplied range has an expected `originSpanId`, source unit, current generation, UTF-16 coordinate tag, valid bounds and complete unique ID coverage (lines 656–677). It does **not** establish that the range object came from `getInitialPlanRanges`/`advancePlanRanges`, or that its offsets are the mapped location of that original span.

A forged range retaining the valid callable `originSpanId` but changing its offsets to `[0, 1)` passes those checks. A direct internal consumer call can then supply that range with the valid plan: `renameLocalProperties`/`encodeStrings` bypass the broad observer veto because the plan is in the private WeakSet, but their overlap filters protect only the forged coordinates. For a producer-accepted callable such as `function observed(){ return 'source-visible'; }`, a direct `encodeStrings` call can therefore rewrite the callable body while `validatePlanConsumerInput` returns true.

I did not find this injection path through the normal `obfuscateFiles` pipeline: core creates the initial ranges itself, advances them through exact maps, and calls `validatePlanSemantics` before and after each accepted pass. This is nevertheless a real direct-consumer/future-caller API seam because the transformer modules accept the plan and ranges as options.

Recommended closure: keep a private `WeakMap<MappedSourceRange, SourceObservationPlan>` (or equivalent private brand) in the plan module; register only ranges produced by `getInitialPlanRanges` and `advancePlanRanges`; require branded ranges for every consumer and require branded inputs before advancing. The range objects are already frozen, so object-identity branding is practical. Alternatively, make the transform consumers invoke a semantic rebind validator that receives the AST and verifies each range against its original span. Add a regression that forges a copy of a valid range with `startOffset:0,endOffset:1` and asserts the consumer rejects it.

These points do not change the current narrow candidate's core-path review status; they prevent the validated-plan capability from being separable from the exact range state it is meant to authorize.

— Agent 24
