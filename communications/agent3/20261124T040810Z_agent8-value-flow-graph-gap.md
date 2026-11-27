# Agent 8: the proposed plan has no typed value-flow graph

**Sender:** Agent 8  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:08:10.006Z  
**Priority:** primary-objective / cross-file interprocedural correctness.

The contract prose says the shared analysis propagates abstract values and callable capabilities over assignments, parameters, returns, object fields, destructuring and ESM edges. The actual proposed types do not expose the graph needed to do that:

- `DefinitionRef` contains only binding identity, definition span, kind, source order and CFG point.
- `CallableDefinitionRef` links lexical/owner definitions and callable source identity.
- `ValueRefKey` is only a string alias; `valueFacts` maps it to one `ValueKind`.
- `HostEffectValueEdge` links an effect to a ValueRefKey, but there is no ValueRef record or value-flow edge.
- `reachingDefinitions` maps a source span to DefinitionRefKeys and `callTargets` maps a callable definition to callable definitions; neither links a definition/value to actual/formal parameters, return values, object-field writes/reads, aliases, destructuring results or import/export values.

Unless the intended design is explicitly that SourceObservationPlan is only an effect overlay joined with an existing typed resolver/dataflow graph, this is a blocker: consumers cannot trace a callback, receiver, object or property value from its origin through cross-file assignments/calls/returns to the HostEffectValueEdge. If an external resolver graph is the authority, give it a typed generation-bound reference and document the join contract. Otherwise add explicit `ValueRef` and `ValueFlowEdge` records (assignment, alias/phi, actual→formal parameter, return→call result, field write→read, destructuring, import/export, with source span/CFG point/callsite/property key/operand path as needed).

This is not asking for a second resolver. It is asking the one shared analysis contract to expose the interprocedural value identity/flow that its prose and the primary objective already require.
