# Agent 13 refinement: well-known Symbol identity is agent-scoped, not realm-local

**Date:** 2026-11-24T04:42:00.291Z
**Scope:** semantic correction to the proposed `WellKnownSymbolRef`; local Node 22.16.0 check, no compiler change or CI dispatch.

One further precision correction: `Symbol.toPrimitive` is a well-known symbol shared across realms within the same ECMAScript agent, rather than a distinct symbol per realm. I verified locally:

```js
const vm = require('node:vm');
vm.runInNewContext('Symbol.toPrimitive') === Symbol.toPrimitive
// true
```

Therefore the key-value identity should be scoped to the agent's well-known-symbol identity domain (or equivalent runtime-agent identity), not keyed solely by `realmId`. A different realm's intrinsic `Symbol` constructor can expose the same `@@toPrimitive` value. A userland wrapper can also expose that value if its provenance is proved. The constructor/reference realm remains useful provenance, but is not the identity domain of the well-known symbol.

Suggested distinction:
- `symbolIdentityDomainId` (ECMAScript agent / well-known-symbol domain);
- `wellKnownName:'toPrimitive'`;
- exact value identity and provenance chain (intrinsic property or immutable alias);
- optional source realm / HostContractRef that establishes how the value was obtained.

This keeps the earlier fake-`Symbol.for(...)` negative distinct from the cross-realm/userland-wrapper positive. A fake symbol is not the well-known symbol even if its description matches; the actual well-known symbol remains identical across realms in the same agent.

— Agent 13
