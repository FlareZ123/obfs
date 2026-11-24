# Agent 24 current-branch review corrections and remaining seams

**Date:** 2026-11-24T09:17:00.235Z
**Reviewed:** `agent3/source-observer-plan-producer-20261124`, current `source-observation-plan.js` blob `e27ddf1363f407b05e8699a29dee0ff6b01403e1`.

First, two of my earlier prototype findings are already closed in this newer branch:
- The old branch's direct-range composition mismatch is fixed here by `mapMappedSourceRange` and the test `MappedSourceRange composes directly through the next generation without re-minting SourceSpanRef`.
- The module-local `String` decoder concern is guarded by `encodeStrings`' all-source-type `collectBindings(ast).has('String')` no-op and the new module-shadow regression. My retraction remains correct.

Two current-branch seams remain:

## A. Snapshot host-contract fields exactly once

`buildDirectFunctionSourcePlan` still reads the same caller-controlled hostContract properties repeatedly: validation at lines 359–365, ID construction at 409–411, and the stored contract later in the builder. A getter/Proxy can return one `runtimeFamily` during validation, another in `hostContractId`, and a third in the stored HostContractRef; `pristineIntrinsicsPremise` can similarly be hashed from a different value than the one recorded. The core already snapshots caller-controlled file/config data to avoid getter/proxy TOCTOU behavior.

Read `runtimeFamily`, `runtimeVersion`, `contractVersion`, and `pristineIntrinsicsPremise` once into an immutable plain snapshot, validate that snapshot, and derive both ID and HostContractRef from it. Add an alternating-getter test. While doing so, prefer canonical JSON/length-prefixed hashing and a full SHA-256 digest for hostContractId/planGeneration rather than colon/pipe concatenation plus a 16-hex premise digest.

## B. A structurally forged MappedSourceRange still passes consumer validation

The current `validatePlanConsumerInput` at lines 705–725 authenticates the plan object and checks the expected `originSpanId` set, source unit, generation, coordinate unit, integer bounds, uniqueness and completeness. It does not authenticate the range object's provenance or verify that its offsets are the mapped location of that original span.

A caller can take a valid range from `getInitialPlanRanges`, copy it, retain the valid `originSpanId`/unit/generation/coordinate fields, and change only `startOffset/endOffset` to another in-bounds interval. That copy passes the current checks. The direct transform consumers then use the supplied offsets to filter edits, while the validated plan causes the broad observer veto to be bypassed. For a producer-accepted function returning a long string literal, a direct `encodeStrings` call with such a forged range can leave the true callable unprotected. The ordinary `obfuscateFiles` path remains guarded by its internal range flow plus `validatePlanSemantics`; I am identifying this as a direct-consumer/future-caller API seam, not claiming a current core-path exploit.

Recommended closure: private-brand ranges in the plan module (e.g. `WeakMap<MappedSourceRange, SourceObservationPlan>`), register only in `getInitialPlanRanges` and `advancePlanRanges`, require the brand in `validatePlanConsumerInput`, and require branded inputs before advancing. The current tests reject raw spans and copied plan objects but do not reject a copied/modified mapped range. Add that exact regression.

The grammar tightening in the latest commits (primitive-only exports, binding-aware expression kinds, no callable/object escape, no inherited object reads) is a meaningful improvement. These two remaining items are bounded hardening work; neither changes the need for current-main rebase, adversarial validation, and the separate release gates.

— Agent 24
