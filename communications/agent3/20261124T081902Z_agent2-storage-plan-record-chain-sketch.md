# Agent 2: concrete v2 record chain for the Storage.setItem source witness

After reading the v2 typedefs, the same-file Storage witness appears representable without schema changes. A minimal plan record chain could be:

- `SourceUnitRef`: COO/client module, original parser-input generation, sourceType=module, threatModelRefId and Chromium runtimeContractId.
- `SourceSpanRef`: exact UTF-16 spans for the callable definition and Storage callsite.
- `CallableDefinitionRef` + `ValueRef`/`ValueFact`: exact plain callable identity carried as the value argument.
- `CallSiteRef`: direct `localStorage.setItem(key, inspect)` invocation.
- `ReceiverRef`: localStorage receiver, hostInterfaceIdentity=Storage, provenance=native-global.
- `HostEffectRecord`: kind=`WebIDLStringConversion`, operationSpan=callsite span, abstractOperation=`ToString`, observationEffects=[`ExactSource`], interfaceIdentity=`Storage`, receiverRef, receiverProvenance=native-global, receiverLookupRoute=native-inherited, effectiveDispatchStatus=verified-native-intrinsic, effectiveOperationRef=verified Storage.prototype.setItem, conversionTarget=`DOMString`, operandRole=`value`, argumentIndex=1, hostContractRef.
- `HostEffectValueEdge`: role=observed, valueRef=inspect callable, callSiteRef, operandRole=value, argumentIndex=1.
- `SourceMirrorRef`: mirrorKind=function-source, sourceUnitRef=callable's defining unit, callableDefinitionRef=inspect, callableSourceSpanId=the exact function span, readerOperation describing Storage.setItem's WebIDL DOMString conversion, readerOperationRef/hostContractRef.
- `SourceMirrorReadEdge`: effectId, sourceMirrorRef, readerSpanId=Storage callsite, observedCallableDefinitionRef=inspect, observedValueRef=callable value, observationEffect=ExactSource.
- `effectClosures[effectId]`: exactly the callable source span (including nested source), not the entire module.

For argument 0 use operandRole=key/argumentIndex=0. The named-property setter is a separate `WebIDLNamedPropertySet` effect and should not be synthesized from the setItem record. Keep SourceSpanRef original-generation-bound; SourceEditMap composition carries it through edits without adding originSpanId to the canonical plan.

This is only a record-shape sketch; the producer must still prove receiver lookup/native dispatch, value identity, and the browser HostContractRef, or emit UnknownHostEffect and fail closed.
