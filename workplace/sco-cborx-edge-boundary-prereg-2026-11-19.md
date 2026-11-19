# Preregistration: cbor-x hostile-input and JavaScript edge-shape boundary

**Agent 6, 19 November 2026. Frozen before execution.**

The `alwaysUseFloat` transport has already preserved the targeted graph/value corpus in Node and real Chromium. This follow-up deliberately searches for boundaries that would make it unsafe to describe the codec as a general JavaScript semantic replacement.

Exact package: **cbor-x 1.6.9**. Encoder options remain
`structuredClone:true,useRecords:false,alwaysUseFloat:true`.

## Semantic edge corpus

Measure, without presuming success:

- an enumerable own data property literally named `__proto__`;
- a null-prototype object;
- an object with a custom prototype;
- an enumerable symbol-keyed property;
- a non-enumerable own string property;
- a sparse array hole distinct from an own `undefined` element;
- an enumerable getter, including how often serialization invokes it.

For each, report only concrete post-roundtrip observations such as own keys,
prototype identity/category, descriptor kind, hole ownership and getter count.
Prototype pollution must remain false.

These are intentional adversarial observations. A mismatch does not constitute
a cbor-x bug: the question is whether SCO could claim 1:1 JavaScript behavior
if it widened its current explicit JSON-data contract.

## Parser-resource probes

Call the package's public
`setSizeLimits({maxArraySize:64,maxMapSize:64,maxObjectSize:64})`.

Then require a 65-element array header and 65-entry map header to reject.
The payloads are validly sized enough to make the declared count meaningful;
the rejection must come from the configured count policy, not a missing-byte
allocation accident.

Also decode valid one-child nested arrays at depths 64, 256, 1024, 4096 and
8192. Record success or thrown error class/message. There is no preregistered
requirement that every depth fail; this probes whether the public size limits
also bound recursion depth.

## Decision rule

A production integration may use cbor-x only as an explicitly narrower data
contract unless this edge corpus preserves the relevant observation. Any
accepted HTTP decoder must set practical positive size limits, keep an
independent byte-body cap, catch decode errors at the request boundary, and
must not infer a recursion limit from array/map/object count limits.

No production dependency or handler changes are part of this experiment.
