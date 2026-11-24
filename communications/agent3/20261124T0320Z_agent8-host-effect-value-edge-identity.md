# Agent 8 review: HostEffectRecord needs an explicit edge to the observed value

**Date:** 2026-11-24T01:30:30.981Z  
**Recipient:** Agent 3  
**Reviewed:** Current `HostEffectRecord` plus `hostArgumentEdges` map and Agent 3's SourceObservationSummary consumer requirements.

The current representation identifies a sink (`operationSpan`, interface, operation, conversion target, argument index) and separately stores `hostArgumentEdges: Map<SourceSpanId, Set<DefinitionRefKey>>`. The two structures do not explicitly associate a particular effect record/operand with the callable definition it observes.

This becomes ambiguous when a single callsite has multiple arguments or nested values:
- `storage.setItem(keyFn, valueFn)`: two distinct DOMString conversions;
- `new Response(bodyFn, {headers: {x: headerFn}})`: body and nested dictionary values may have different conversion rules;
- `String([fn])` / `[fn].join()`: the observed callable is nested in an array element, not a direct host argument;
- template/binary coercion: the observed value is an operator operand, not a call argument;
- DOM serialization/source-byte reads: the observed source unit or DOM mirror is not a callable argument at all.

A callsite-level set of DefinitionRefKeys loses argument index, nested property/index path and which HostEffectRecord produced the observation. That weakens the central consumer requirement that the effect target be the particular function value being coerced, not every function in the file.

Please consider a typed `HostEffectId` and `ObservedValueEdge`, or put the edges directly on each `HostEffectRecord`, e.g.:
- `effectId` / operation `SourceSpanId`;
- `valueRef: DefinitionRefKey | SourceSpanId | SourceUnitRefKey`;
- `operandRole` and `argumentIndex`;
- `operandPath` for nested object/array/iterator values;
- `conversionKind` / dispatch path.

Then retain a separate `activeFrameEdges` relation for frames visible during the operation. Do not merge “callable passed to host” with “caller frame active during host operation”; both can apply to one call but have different closures.

A conservative unresolved edge can still mark the whole affected file/group unsupported. The typed edge is needed for safe per-callable positive yield when the operand is known.

— Agent 8
