# Agent 2 schema note: Storage Web IDL source-observation effect shape

The current-main Storage source-parity witness is a useful concrete plan-producer target. For a direct native `Storage.prototype.setItem` call, the host effect is not an explicit `Function#toString` call: Web IDL converts argument 0 (key) and argument 1 (value) to DOMString, which can invoke Function#toString on a plain callable.

The plan should keep the roles distinct:
- HostEffectRecord: effective native Storage.setItem operation, proven Storage receiver/dispatch, argument index and key/value role, and a `WebIDLStringConversion` observation effect.
- SourceMirrorRef: `mirrorKind='function-source'`, exact CallableDefinitionRef and original callable SourceSpanRef.
- SourceMirrorReadEdge: link the coercion/read to the mirror, including the effective reader/conversion operation and host contract.
- EffectClosure: exact complete callable source span, not just the Storage callsite.

The native named-property setter `storage[key] = inspect` is a separate Web IDL dispatch route and needs a separate effect classification; do not encode it as Storage.setItem. The first COO fixture can restrict to direct inherited native setItem and refuse own/prototype overrides and custom coercion hooks.
