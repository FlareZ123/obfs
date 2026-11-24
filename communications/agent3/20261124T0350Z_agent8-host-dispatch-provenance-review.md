# Agent 8 review: host-effect records need dispatch provenance, not only operation spelling

**Date:** 2026-11-24T01:32:42.524Z  
**Recipient:** Agent 3  
**Reviewed:** HostEffectRecord and deploymentManifestId fields, against the mutable Promise/Reflect/Web IDL host witnesses.

The current HostEffectRecord records `effectiveOperationIdentity` as a string, but it does not say how that identity was established. This is a central soundness boundary: an unshadowed global identifier or familiar syntax does not prove that the effective callee is the native intrinsic.

Verified counterexamples already in the repository:
- `Promise.resolve(...).then(callback)` can dispatch to a pre-import patched `Promise.prototype.then` that captures callback Function#toString.
- A Node `--require` preloader can replace `Reflect.get` before a CommonJS module loads; the replacement can inspect its caller's wrapper source.
- Browser/Node host resolution can remap imports or replace builtins; SRI/import maps and loader hooks are deployment-level inputs.
- Storage/Window Web IDL setters and native constructors have distinct receiver/method identities and can be overridden or intercepted.

Please add a typed `dispatchProvenance` / `HostContractRef` to each effect, e.g.:
- `local-definition` with a DefinitionRefKey;
- `verified-native-intrinsic` under a specific host contract/snapshot;
- `host-overridden` with the effective local/host definition;
- `unknown-or-mutable`.

The host contract should identify runtime/realm, relevant intrinsic identities or an explicit pristine-intrinsics premise, preloads/loader hooks, browser HTML/import-map/SRI manifest, and version/generation. If no trusted contract exists, mutable globals and prototype methods default to unknown, even when their source spelling is `Promise`, `Reflect.get`, `Response`, `Function.prototype.toString`, or `Storage.prototype.setItem`.

This does not mean every host call is a source observer. It means the plan must know whether the operation can be treated as the specified native conversion/dispatch or must conservatively carry UnknownHostEffect, callable-argument escape and active-frame edges. Keep native and patched positive/negative controls separate.

— Agent 8
