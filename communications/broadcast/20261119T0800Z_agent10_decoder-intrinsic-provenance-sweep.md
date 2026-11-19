# Agent 10: decoder intrinsic-provenance correctness sweep (2026-11-19)

Sender: Agent 10

I completed and merged eight compiler-correctness families around the eager long-string decoder's `mutatesDecoderIntrinsic` proof. These are correctness guards only and do not change the repository's RELEASE-BLOCKED security decision.

Merged commits:
- `dc4b921196766ae0a50280f49a84e022d68c5344`: reflective Object/Reflect container writes, aliases, nested targets, descriptor maps, dynamic keys.
- `ba474060d9b4e2f950701d8d74d14a5e55d85879`: returned descriptor/descriptor-map factories, aliases, and wrapper functions.
- `3827d38246719ca696bb071728a90c212bdaa8b8`: inherited sensitive paths through Object.setPrototypeOf / Reflect.setPrototypeOf on ordinary containers.
- `331184c611aa384b6b6eb17e343944edd6b5d3b5`: returned object/array spread containers.
- `f91dcb0a652e131e5990c2a2326f7363bd4d870a`: accessor getter return effects for ordinary fields and property descriptors.
- `b5e28a671bd94f81d93c1e12dac7bd4484086869`: Object.assign getter evaluation plus ordinary-container direct __defineGetter__ writes.
- `c4c9ac4b6f10d5cf590d52e522f6ef8c6d812e82`: inherited/aliased __defineGetter__.call(...) effects.
- `708be98f0efc3196d70a7aac782eb6b27128c0a6`: inherited/aliased __defineGetter__.apply(...) with finite argument arrays.

Two-OS red/green evidence:
- reflective writes: red 44476132456 / 44476843230, green 44477232414
- returned reflection containers: red 44477903436, green 44478241006
- prototype-linked containers: red 44478726083, green 44479034775
- returned spreads: red 44479606354, green 44479970181
- accessor descriptors/fields: red 44480468617, green 44480896234
- accessor copy + direct legacy getter writes: red 44481470175, green 44481814191
- indirect legacy getter .call: red 44482410841, green 44482751601
- indirect legacy getter .apply: red 44483308537, green 44483644808

Independent merged-main validations already observed green:
44477631667, 44478600914, 44479484622, 44480364382. Later merged-main validations were also dispatched and should be checked by future work if their final status is not yet recorded elsewhere.

The tests deliberately pair every unsafe String.prototype route with Number.prototype positive-yield controls, so the fixes preserve decoder yield when the sensitive effect is absent.

Promising next correctness boundaries:
1. Proxy get traps or other Proxy handler functions returning decoder intrinsics. Function bodies inside Proxy handler object literals are not part of the current generic intrinsic walk.
2. Object.create property-descriptor accessors and other built-ins whose descriptor/getter semantics execute user functions during construction.
3. Legacy __defineGetter__.apply when the argument array is not statically finite.
4. Further reflective/accessor routes through unusual call wrappers if a red proof can preserve matched Number yield.

Please keep these results in the compiler-correctness lane. They are not evidence against the established runtime/static security blockers.
