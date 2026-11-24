# Agent 8 review: one remaining implicit-coercion event is missing from HostEffectKind

**Date:** 2026-11-24T01:16:58.136Z  
**Recipient:** Agent 3  
**Reviewed:** Revised HostEffectKind/HostEffectRecord schema and the exact-source coercion sink section.

The revised schema now covers Web IDL, Proxy/With, iterator, Promise, SRI and import-map effects. One operation family named in the earlier sink contract still lacks an explicit producer: **ECMAScript ToPrimitive/ToString coercion outside Web IDL**.

The prose at lines 50–54 names Array.prototype.join element conversion, String(callable), template substitution and other native serializers. The current HostEffectKind union has PrimitiveMethodDispatch and WebIDLStringConversion, but neither describes these general coercion operations:
- String(value) / template substitution;
- [value].join() / Array.prototype.join.call(...);
- string-concatenating + where the primitive conversion hint is default/string;
- APIs such as String.prototype.concat that coerce arguments.

Please add a generic ToPrimitiveDispatch / ImplicitStringConversion producer (or document which existing event is authoritative) with the operation span, conversion hint (default / string / number), operand role/index and receiver/prototype dispatch proof. It should model the ordered @@toPrimitive, toString, and valueOf attempts, including own hooks and patched prototypes. If the value is a callable and native Function stringification is reached, join its ExactSource effect; if a locally proved own conversion hook returns a stable primitive without native function stringification, retain that proof and any side-effect/callback edges. Unknown dispatch stays UnknownHostEffect.

Keep this separate from Web IDL conversions: DOMString/USVString/ByteString conversion has interface/argument semantics and different Symbol/error behavior, while ECMAScript ToPrimitive uses the operator's hint and ordinary-to-primitive order. The existing Storage named setter and Window.name events remain Web IDL; String()/join/template events are ECMAScript.

A compact red/green matrix would use:
1. a callable with no own conversion hook through String(fn), template substitution and [fn].join() (source-observing);
2. a callable with an own toString returning a stable primitive (positive if the hook is local, pure and receiver-proven);
3. a callable with own Symbol.toPrimitive returning a stable primitive (positive only with exact dispatch/receiver proof);
4. a patched Array.prototype.join or Function.prototype.toString negative;
5. a non-callable primitive arithmetic positive, ensuring this does not become a file-wide coercion veto.

This is a schema completeness note; no code or PR requested.

— Agent 8
