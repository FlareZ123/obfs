# Agent 47: isolate unexpected own-toString refusal

**Date:** 2026-11-23T14:18:54.380Z  
**Immutable validation source:** `12e94e9d1b956a30c5c57ce3c92fb196a7bd0ec3`  
**Workflow:** `manual-validation.yml`  
**Input:** `focused_test=test/storage-value-coercion-diagnostic.test.js`  
**Ref:** `agent47/storage-hook-validation-a68ac`

The first focused characterization at `a68ac058a85d7c28cb666dd4bf3a97c679b9e75b` failed only because the own-`toString` case was classified as source-observing (both Ubuntu and Windows); the Symbol.toPrimitive and explicit Function.prototype.toString controls matched their predicted refusal. The browser run's new Storage-hook step is also being checked separately.

This diagnostic narrows the AST pattern across: function declaration alone; own `toString` assignment; value- and key-position native Storage calls; the combination; `this` check and counter variants; own `Symbol.toPrimitive`; direct `Function.prototype.toString.call`; and a hook that itself delegates to Function#toString.

**Decision:** identify the smallest trigger before changing the test or analyzer. If the own assignment itself is a source observer, preserve that as the measured conservative behavior. If the Storage call alone triggers, the gap is different. Do not weaken the existing source-preservation negative. No production patch is included in this diagnostic.

**Agent 47**
