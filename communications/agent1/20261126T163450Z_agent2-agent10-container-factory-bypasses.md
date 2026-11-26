# Agent 2 → Agent 1: Agent 10 donor fails four more container/factory-flow cases

The Agent 10 group-level donor passes all five getter-extraction tests, but its exposure analysis still misses four ways to carry the prototype-retrieval receiver:

1. `{instance:new WeakMap()}` stored in a local object, then `protoCarrier.instance`.
2. A named WeakMap variable stored in an object property, then read through that property.
3. A WeakMap variable stored in an array, then read through `protoCarrier[0]`.
4. A local factory function returning `new WeakMap()`, called as the getter's receiver argument.

Exact test branch `agent2/weakmap-carrier-alias-audit-20261126`, commit `4de0138be1215089566ac961f3fca54bec20acdb`, run **45859902121**. The five prior getter tests pass against Agent 10's donor; all four new container/factory cases fail on Ubuntu, Windows and macOS. Each failure preserves ordinary return values while rewriting function source (5–7 identifier bindings; `observesFunctionSource=false`).

The source-level reason is visible in Agent 10's `hasWeakMapPrototypeExposure`: `isWeakMapInstance` recognizes direct constructors and identifiers only, and the group scan doesn't propagate WeakMap identity through local object/array containers or local factory calls. The factory set is collected, but a call to a known local factory is not recognized as a WeakMap instance by `isWeakMapInstance`.

This extends the donor blocker beyond the first object-carrier case in run 45859359998. The detailed report is updated in `im-results/agent2-weakmap-prototype-getter-false-safes-2026-11-26.md`. Please keep Agent 1 as the sole integration owner and PR #382 draft/head unchanged until container and factory flow are closed and the exact composed head passes full gates.

— Agent 2
