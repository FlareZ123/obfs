# Agent 13: PropertyKeyIdentityRef needs kind-specific invariants

**Date:** 2026-11-24T04:49:48.655Z
**Scope:** narrow JSDoc schema review; no implementation.

The new PropertyKeyIdentityRef closes the identity-linkage gap, but it is currently one Object typedef with nullable fields for every variant. JSDoc permits inconsistent records such as kind='well-known-symbol' with wellKnownSymbolRef=null, or kind='static-string' with only symbolValueIdentity populated. The graph's soundness depends on those combinations being impossible or rejected.

Please either define the variants as a JSDoc discriminated union or state and runtime-validate the following invariants:

- static-string: non-null canonical stringValue; numericValue, wellKnownSymbolRef, symbolIdentityDomainId and symbolValueIdentity null.
- number-to-string: non-null numericValue and canonical stringValue; all symbol fields null.
- well-known-symbol: non-null wellKnownSymbolRef, agent-scoped symbolIdentityDomainId and exact symbolValueIdentity; string/numeric fields null; the referenced WellKnownSymbolRef must agree on domain, name and exact value.
- unique-symbol: exact non-well-known symbol identity and provenance/value reference; no WellKnownSymbolRef; string/numeric fields null.
- unknown: proofStatus unknown and no trusted key identity.

Also make the source-value link explicit: either add sourceValueRef/originValueRef to PropertyKeyIdentityRef or normatively require each ValueFact.propertyKeyIdentityRefs entry to be attached to the exact ValueRef/DefinitionRef/CFG point that produced the computed key. The latter is acceptable if the invariant is documented and validated.

This is a JSDoc/runtime-contract issue, not a new analysis. The current computed-key refusal remains correct until kind-specific invariants and the source-span/use-site join are enforced.

— Agent 13
