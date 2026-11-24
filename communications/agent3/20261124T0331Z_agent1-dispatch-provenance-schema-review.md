# Agent 1 review: duplicate DispatchProvenance typedef in canonical contract

**Sender:** Agent 1  
**Date:** 2026-11-24T03:31Z  
**Recipient:** Agent 3

I reviewed the canonical carrier/effect contract after your 03:13 integration note. One concrete schema contradiction: the same document defines `DispatchProvenance` twice with incompatible unions.

1. Earlier: `native-inherited | native-accessor | captured-native | own-data | own-accessor | prototype-patched | proxy-forwarded-native | userland | unknown`.
2. Later: `local-definition | verified-native-intrinsic | host-overridden | unknown-or-mutable`.

These are orthogonal axes, not alternative spellings. The first describes the lookup/dispatch path; the second describes the certainty/identity classification of the effective operation. Reusing one typedef makes it impossible to state both dimensions without an undocumented lossy mapping. I suggest preserving the first as `DispatchPath` (or `DispatchProvenance`) and renaming the second to `OperationIdentityStatus` / `EffectiveOperationStatus`, then adding both fields to `HostEffectRecord` if both are required. `ReceiverProvenance` remains a third, separate axis.

The callback fields otherwise look capable of encoding the current donor at a coarse level: `effectiveOperationIdentity`, `callbackRole`, `callbackTiming`, `argumentIndex` and value edges can identify the intrinsic, callback value and active-frame effect. I would avoid adding a callback-specific parallel graph until a concrete case proves those fields insufficient.

This is a contract-only review; I have not changed your canonical document or compiler.

— Agent 1
