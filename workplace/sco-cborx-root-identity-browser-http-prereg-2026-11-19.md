# Preregistration: proof-gated cbor-x root identity through real Chromium and binary HTTP

**Agent 6, 19 November 2026. Status: frozen before implementation.**

## Trigger

Two independent intermediate results now exist:

1. the exact `cbor-x@1.6.9` root-identity response-token lane passed its
   preregistered Node hot-work gate on Ubuntu and Windows in Actions run
   **44446142106**;
2. the corrected conservative root-identity eligibility proof passed strict
   JSDoc and its frozen/adversarial corpus on both platforms in Actions run
   **44448320104**.

The repository also already established that the exact
`cbor-x@1.6.9/dist/index.js` browser bundle with
`structuredClone:true,useRecords:false,alwaysUseFloat:true` preserves the
targeted graph/value corpus in real Chromium and over one binary HTTP
roundtrip.

This experiment composes those pieces. It does not change production SCO.

## Frozen application module

Use one module containing three directly exported async operations:

### `echo(payload)`

Read a deterministic nested numeric field, then return the exact top-level
`payload` object.

Expected static proof: **eligible**.

### `score(payload)`

Iterate `payload.records`, primitiveize numeric fields with bitwise arithmetic,
and return an integer checksum.

Expected static proof: **eligible**.

### `nested(payload)`

Return `payload.records[0]`.

Expected static proof: **refused** because a nested input object may be returned
with preexisting client identity.

The server must run the v2 source proof before exposing an operation. A refused
operation must not execute.

## Frozen wire protocol

Use exact **cbor-x 1.6.9** on browser and Node with:

`new Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true})`.

The browser sends a CBOR-encoded argument array through loopback HTTP with a
fixed local admission header. The header is only a route-control mechanism and
must not be described as anti-relay authentication.

For an eligible operation:

1. Node decodes the argument array.
2. Node executes the operation.
3. If the result is strictly identical to decoded top-level argument `i`,
   Node encodes `{kind:'arg',index:i}`.
4. Otherwise Node encodes `{kind:'value',value:result}`.
5. Browser decodes the envelope. An `arg` token resolves directly to the
   original pre-request browser argument at that index. A `value` response
   returns its decoded value.

The browser must not infer identity by comparing serialized values.

## Frozen semantic source graph

The browser root contains:

- 32 deterministic records;
- one shared object referenced from two properties;
- a root self-cycle;
- own `undefined`;
- `NaN`;
- signed zero;
- a fixed large `BigInt`;
- Date;
- RegExp;
- Set;
- Map.

These are within the already-tested cbor-x admitted corpus.

The Node `echo` operation records whether the decoded root retains the cycle,
shared reference and special-value observations before returning it.

## Required observations

The run is useful only if all of these hold:

1. v2 proof accepts `echo`;
2. v2 proof accepts `score`;
3. v2 proof refuses `nested`;
4. browser `await invoke('echo',[root]) === root`;
5. browser `score` equals a direct local implementation on the same data;
6. Node-side decoded `echo` observations all pass;
7. the nested HTTP route is refused before operation execution;
8. nested execution count remains exactly zero;
9. exactly one echo and one score operation execute;
10. cbor root-token response is smaller than a full cbor value response for the
    same 32-record root, measured as encoded byte lengths inside the Node
    process.

The response-size comparison is descriptive. It is not a bandwidth-security
claim.

## HTTP and timing boundary

This is a semantic integration experiment. Actual HTTP/browser wall-clock
latency is deliberately excluded from the 2.5x compute-budget decision because
the prior root-token experiment already measured recurring encode/decode/task
process CPU under the frozen 4,096-call protocol.

Record browser bundle bytes, request bytes, root-token response bytes, and full
value-response bytes. Do not convert the loopback fetch duration into a general
performance result.

## Failure handling and decision

Any proof classification mismatch, browser identity mismatch, special-value
mismatch, nested execution, checksum mismatch, or malformed protocol response
rejects the composed experiment.

A fully passing result establishes only that the conservative selector and
root-token transport compose correctly through a real browser and binary HTTP
for this admitted fixture. It does not remove:

- cbor-x edge-shape boundaries already documented by the repository;
- the need for request-byte and nesting limits;
- whole-program/cross-module proof work;
- the authorized same-account SCO relay boundary.

Passing does not change **RELEASE-BLOCKED**.
