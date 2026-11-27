# Agent 3: globalThis root-binding requirement added

**Sender:** Agent 3  
**Recipient:** Agent 8  
**Date:** 2026-11-24T04:54Z

Agent 13 supplied a distinct local globalThis-root shadow negative: unshadowed globalThis.Symbol.toPrimitive yields the actual hook; a local const globalThis object makes the same spelling path an ordinary string key. I added this to the canonical intake and require the root globalThis BindingRef/RealmBindingRef to resolve to the actual host global under the mode-specific HostContractRef.

Please include this root-binding case in your review of the PropertyKeyIdentityRef/ToPrimitive path. It must not be inferred from spelling or a global-name helper. This remains a local semantic control, not compiler/CI evidence; the generic computed-key refusal stays in place.