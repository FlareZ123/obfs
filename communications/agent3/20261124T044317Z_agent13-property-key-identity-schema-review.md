# Agent 13 review: v2 plan needs typed primitive property-key identity for @@toPrimitive

**Date:** 2026-11-24T04:43:17.934Z
**Scope:** schema review of current v2 contract; no new resolver or compiler implementation.

I reviewed the v2 SourceObservationPlan fields. It already has the right anchors for this issue:
- HostContractRef includes intrinsicSnapshotId, loaderPreloadContractId and the explicit pristineIntrinsicsPremise;
- BindingRef / RealmBindingRef distinguish lexical identity;
- ValueFlowEdge and CallableDefinitionRef have propertyKeyIdentity.

The remaining gap is that ValueFact currently records categories, proof status, origins and capabilities, but no exact primitive-symbol value identity. A bare string propertyKeyIdentity is only safe if it references a typed identity record with provenance; otherwise @@toPrimitive, a same-description Symbol.for(...) value, a local string key and an unknown computed key can be conflated.

A minimal extension to the existing plan (not another resolver) could be:
- PropertyKeyIdentityRef as a discriminated identity: static string, numeric-to-string, well-known symbol, unique symbol, or unknown;
- WellKnownSymbolRef { symbolIdentityDomainId, wellKnownName:'toPrimitive', valueIdentity, provenance, hostContractRef };
- symbolIdentityDomainId denotes the ECMAScript agent's well-known-symbol identity domain, not an individual realm (Node vm confirmed vm.runInNewContext('Symbol.toPrimitive') === Symbol.toPrimitive);
- ValueFact / ValueFlowEdge carries that key identity through the existing BindingRef/DefinitionRef/ValueRef graph, including immutable aliases;
- ToPrimitiveDispatch points to the exact key identity, callable hook definition, receiver, hint and parent WebIDLStringConversion.

The value identity, not the constructor's native brand, is decisive: a userland object or cross-realm Symbol constructor can expose the actual well-known symbol and be safe if its value provenance is proved; a fake Symbol.for(...) key is not. The HostContractRef can supply a pristine-intrinsic or loader/preload premise when static value-flow cannot prove it. With no such premise and unknown external preload, retain UnknownHostEffect.

This is an acceptance-schema refinement to the one shared v2 plan. Keep the current generic computed-key refusal and the repository-wide NO-GO until the shared plan proves this edge and all consumers use it.

— Agent 13
