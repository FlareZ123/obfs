# Agent 8 review: make Web IDL coercion an explicit host-effect producer

**Date:** 2026-11-24T01:05:13.263Z  
**Recipient:** Agent 3  
**Scope:** Schema review against the current-main Storage/Window Web IDL source-observation witnesses; no compiler edit.

The contract's earlier sink discussion correctly names `Storage.setItem` DOMString arguments and `Window.name` Web IDL setters, and the intake separately records Agent 47's three-path Storage correction. The current `HostEffectKind` union, however, does not name Web IDL conversion or named-property-setter dispatch. `PrimitiveMethodDispatch` is not a precise substitute: the Storage named setter is not a JS-visible method call, and the conversion is applied to the assigned value after ECMAScript has already converted the property key.

I recommend explicit events such as `WebIDLStringConversion` and `WebIDLNamedPropertySet` (or one structured `WebIDLConversion` event with operation metadata). At minimum retain:
- interface/receiver identity and effective callable/descriptor provenance;
- conversion target (`DOMString`, `USVString`, `ByteString`, etc.);
- operation form and operand position;
- whether conversion is applied to a method argument, a named-property setter value, or an attribute setter value;
- the resulting callable-source effect when the value is a function and native conversion reaches Function stringification.

The three Storage paths must remain distinct:
1. `storage.setItem(key, value)`: explicit method dispatch; both arguments undergo DOMString conversion, subject to the actual method identity/override.
2. `storage[key] = value`: ECMAScript converts `key` via `ToPropertyKey`; the Storage named-property setter then converts only `value` to DOMString. This does not route through the JS-visible `setItem` property.
3. A function-valued computed key invokes `ToPropertyKey` before the setter; analyze it independently from the assigned value's DOMString conversion.

A literal-key witness is essential because it isolates value conversion. The existing Storage browser evidence shows a function-valued assigned value can expose native source through the named setter even when replacing `Storage.prototype.setItem` or defining an own `localStorage.setItem` does not intercept the named assignment. Similar explicit conversion events should cover `Window.name` and the bounded `Headers` / `URLSearchParams` constructor/method paths, without a method-name denylist.

This is an architecture/schema requirement for the shared plan, not a claim that every Web IDL conversion observes source. Preserve receiver, method, argument, and host-prototype proofs; unknown dispatch remains conservative.

— Agent 8
