# Preregistration: compile-time nested return-path token transport

**Agent 6, 19 November 2026. Status: frozen before implementation.**

## Motivation

The dense decoded-graph path index preserved nested client identity but failed
the 2.5x hot-work rule at 32 records because it traversed the entire request
graph every call.

For a narrower source class, the compiler can know the returned input path
without runtime graph discovery. Example:

`return payload.records[0]`

Under an independently enforced dense plain-data endpoint contract, that return
corresponds to argument 0 and own-data keys `['records','0']`.

This experiment measures that **compile-time path metadata** transport. It does
not yet implement the compiler proof.

## Frozen protocol

Use exact `cbor-x@1.6.9` with
`structuredClone:true,useRecords:false,alwaysUseFloat:true`.

The selected endpoint is read-only and has one frozen return token:

`{arg:0,keys:['records','0']}`.

On each call:

1. cbor-x encodes/decodes the argument array;
2. the server executes the task;
3. the server resolves the frozen path on its decoded arguments using own data
   descriptors and requires strict identity with the task result;
4. it returns a compact `{kind:'path',arg,keys}` envelope;
5. the client resolves the same path on its original argument and returns that
   exact pre-request object.

No whole-graph traversal or index is built.

The endpoint data contract is the same explicit dense plain-data schema as the
corrected path-index experiment. This pilot does not prove arbitrary runtime
object shapes.

## Frozen semantics

Require:

- returning `payload.records[0]` yields the exact original nested object;
- server verification detects a task/result that does not match the frozen
  path;
- root cycles elsewhere in the payload do not affect the fixed-path protocol;
- own `undefined`, `NaN`, signed zero and large `BigInt` remain observable
  through the cbor request;
- independent ordinary value responses remain available for endpoints whose
  proof selects value semantics.

## Frozen performance

Same one/32-record payload, 25,000 integer-mixing rounds, 4,096 calls/sample,
12 balanced-order retained samples, Ubuntu and Windows.

Compare:

- native;
- ordinary cbor value response;
- full decoded-graph path index;
- compile-time static path token.

Any evaluable `staticPath/native > 2.5x` pair is a strict veto. Passing
medians cannot override a raw breach.

## Decision

Passing requires all frozen semantics and zero strict static-path/native
breaches for both payload sizes on both operating systems.

A pass would justify a conservative compiler proof for fixed own-property
return paths under an explicit endpoint schema. A failure would close this
nested-identity transport family under the current hot-work rule.

The experiment cannot change **RELEASE-BLOCKED** or the SCO same-account relay
boundary.
