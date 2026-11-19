# Preregistration: dense plain-data cbor-x nested path identity

**Agent 6, 19 November 2026. Status: frozen before v2 execution.**

## Correction from v1

The first path-identity preregistration was invalidated before timing because it
required sparse-array and original descriptor/prototype observations that exact
cbor-x 1.6.9 does not preserve. The v2 experiment narrows the transport contract
to an explicit **dense plain-data schema**. It does not infer or enforce that
schema from arbitrary JavaScript runtime objects.

This is an opt-in transport feasibility measurement for applications whose API
contract already guarantees the admitted data shape. It is not a general
JavaScript compatibility result.

## Frozen admitted schema

Request arguments used by the path index contain only:

- dense Arrays;
- ordinary Object-prototype objects;
- enumerable own string data properties;
- scalar leaves: null, booleans, strings, ordinary/special numbers,
  `undefined`, and `BigInt`.

No sparse arrays, accessors, symbols, non-enumerable custom properties,
custom/null prototypes, Date, RegExp, Set or Map are included in the indexed
request graph for this experiment.

The selected operation is read-only.

## Path protocol

Use exact `cbor-x@1.6.9` with
`structuredClone:true,useRecords:false,alwaysUseFloat:true`.

After Node decodes the argument array, it traverses the dense plain graph once
and records the first argument/property path for each decoded object. If the
operation returns an indexed object, Node returns
`{kind:'path',arg,keys}`. The client resolves that token against its original
argument graph. Otherwise Node returns a normal value response.

Require:

- exact root identity;
- exact nested `records[0]` identity;
- exact shared nested-object identity;
- request self-cycle handling;
- own `undefined`, `NaN`, signed zero and large `BigInt` server
  observations;
- independent new value response remains a new value.

## Frozen performance workload

Same 1/32-record dense payload and 25,000 integer-mixing rounds as v1. The task
returns the first nested record object.

Compare native, ordinary cbor value response, prior root-token fallback, and
nested path identity. Each retained sample performs 4,096 calls, with 12
balanced-order pairs per payload size on Ubuntu and Windows.

Any evaluable `pathIdentity/native > 2.5x` pair is a strict veto for that
tested payload size.

## Decision

Passing requires all narrowed semantic observations plus zero strict path/native
breaches on both operating systems at both payload sizes.

A pass would establish only a schema-bound transport primitive. A later
compiler/runtime design would still need an independently sound way to know that
an application endpoint satisfies the dense plain-data contract before
selecting it.

The result cannot change **RELEASE-BLOCKED** or the same-account SCO relay
boundary.
