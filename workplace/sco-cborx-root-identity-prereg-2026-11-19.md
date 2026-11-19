# Preregistration: cbor-x root-identity SCO fast path

**Agent 6, 19 November 2026. Status: frozen before execution.**

## Motivation

Two prior intermediate experiments expose complementary facts. The cbor-x 1.6.9
`alwaysUseFloat` structured-wire lane preserved the targeted graph/value corpus in
Node and real Chromium and stayed below 2.5x for every observed hot one- and
32-record coarse-work pair. The full JSON identity envelope preserved preexisting
client-object identity, including nested aliases, but incurred large graph traversal
and reconciliation costs.

The separately preregistered read-only JSON identity-token pilot removes response
reconciliation, but its request still uses a hand-built graph plus JSON transport.
This follow-up asks whether an explicitly narrower identity contract can reuse the
already-faster cbor-x request path without a second client-side object-graph traversal.

This is a transport/compatibility experiment. It does not modify production SCO and
does not add anti-relay protection.

## Exact codec and contract

Use exact **cbor-x 1.6.9** with:

`new Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true})`.

The publisher documents `structuredClone:true` as preserving cyclic/object
references and `alwaysUseFloat:true` as forcing numbers, including integers, through
floating-point encoding. The repository's earlier source-pinned experiments already
verified the selected signed-zero behavior for this exact version.

The selected private operation is read-only with respect to its arguments and may
return either:

1. the exact object supplied as one of its **top-level arguments**; or
2. a value result that is independent of preexisting client object identity.

The request is the ordinary cbor-x encoded argument array. The server decodes it and
executes the operation. If the result is strictly identical to decoded argument
`i`, the response is a compact CBOR token `{kind:'arg',index:i}`. The client
resolves that token directly to its original top-level argument object. Otherwise the
server responds with `{kind:'value',value:result}` and the client uses the decoded
value.

This deliberately does **not** preserve a return of `arg.nested`, or a newly-created
result that embeds a nested object reachable from an argument. The semantic probe
must demonstrate that boundary rather than hiding it. A later compiler experiment
would need a conservative proof that a selected function cannot produce such
unhandled aliases or mutate the admitted argument graph.

The admitted data corpus is the exact cbor-x structured-clone corpus already verified
in the repository: cycles/shared references, own `undefined`, `NaN`, signed zero,
large `BigInt`, Date, RegExp, Set and Map. It does not widen to the previously
documented cbor-x edge shapes that change prototype, descriptor, symbol, sparse-hole
or `__proto__` observations.

## Frozen semantic observations

Require:

- `echo(root) === root` at the client;
- duplicate top-level references remain aliased on the server;
- a cyclic/shared argument graph is observed intact by the server;
- signed zero, `NaN`, own `undefined`, large `BigInt`, Date, RegExp, Set and Map
  are observed intact by the server;
- an independent new value result roundtrips with the same targeted cbor-x value
  observations;
- a nested-object return is **measured to be detached from the original nested client
  object**, documenting the selection boundary.

The nested-identity mismatch is an expected negative control and is not an acceptance
failure for this narrower contract.

## Frozen performance comparison

Use one top-level argument object containing either **1** or **32** deterministic
records. The task reads the records, performs **25,000** integer-mixing rounds, and
returns the exact top-level argument object on every call.

Compare:

- `native`: direct call;
- `cborValue`: cbor-x request encode/decode, task, then cbor-x value response
  encode/decode;
- `rootIdentity`: identical cbor-x request encode/decode and task, followed by the
  compact argument-reference response token and resolution to the original client
  argument;
- `jsonValue`: JSON request/value response control on this JSON-compatible timing
  payload.

Each retained sample performs **4,096 calls**. Warm each arm, then collect **12**
balanced-order paired samples per payload size. Record raw process user+system CPU
microseconds and exact checksums. Every native sample must be positive.

For `rootIdentity/native`, **any evaluable paired ratio above 2.5x is a strict veto**
for that tested payload size. Passing medians cannot override a strict breach.

## Decision rule

A useful result requires the complete narrow semantic contract and zero strict
`rootIdentity/native > 2.5x` pairs on Ubuntu and Windows for both one and 32 records.

Passing would justify a separate compiler-analysis experiment for a statically proved
read-only/root-return subset, followed by real Chromium and binary-HTTP validation
before production integration. A semantic contract failure, zero native timing, or any
strict runtime breach rejects the exact fast path for the affected workload.

No result from this pilot changes the repository's RELEASE-BLOCKED security decision
or the authorized same-account SCO relay boundary.
