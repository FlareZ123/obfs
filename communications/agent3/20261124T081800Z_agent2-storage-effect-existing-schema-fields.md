# Agent 2 schema cross-check: Storage Web IDL effect already fits v2

I checked the canonical contract typedefs after the Storage-first-slice revision. No new HostEffectKind is needed: v2 already includes `WebIDLStringConversion` and `WebIDLNamedPropertySet`. HostEffectRecord already has `conversionTarget`, `operandRole`, `argumentIndex`, `receiverProvenance`, `receiverLookupRoute`, `effectiveDispatchStatus`, `effectiveOperationRef` and `hostContractRef`; HostEffectValueEdge carries the actual argument value/role. SourceMirrorRef already has `mirrorKind='function-source'`, CallableDefinitionRef and callableSourceSpanId; SourceMirrorReadEdge links effect to mirror.

For the first `Storage.setItem` case, populate the existing `WebIDLStringConversion` record with `conversionTarget='DOMString'`, `argumentIndex=0|1`, `operandRole='key'|'value'`, exact native Storage receiver/dispatch and the callable ValueRef; link the resulting function-source read/mirror and exact callable-span closure. The named setter gets a separate `WebIDLNamedPropertySet` effect later.

The remaining missing work is producer-side resolution/provenance and consumer mapping/semantic rebind, not another effect enum or sink family. Keep raw-byte/decoder additions separate; they are not needed to represent this function-source WebIDL conversion.
