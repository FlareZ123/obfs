# Preregistration: cbor-x nested argument-path identity fast path

**Agent 6, 19 November 2026. Status: frozen before implementation.**

## Motivation

The cbor-x top-level root-token lane passed its two-platform Node hot-work gate
and a real Chromium/binary-HTTP composition, but the ambient-safe v3 static
selector yielded 0/18 on existing SCO async exports and deliberately refuses
nested input-object returns.

The earlier full JSON identity envelope preserved nested original-client
identity but was decisively over budget at 32 records. Its custom client graph
encoding and post-call reconciliation were major recurring costs.

This experiment tests a middle architecture: keep exact cbor-x structured-clone
request transport, then build a **server-side path index only after decode**.
If the operation returns an object already reachable from a decoded argument,
the server returns a compact argument/property path. The client resolves that
path against the original pre-request argument graph.

This is a transport/compatibility experiment. Production SCO remains
unchanged.

## Exact codec and admitted graph

Use exact **cbor-x 1.6.9** with:

`new Encoder({structuredClone:true,useRecords:false,alwaysUseFloat:true})`.

For path identity, the indexed request subgraph is deliberately restricted to:

- Arrays;
- ordinary Object-prototype objects;
- null-prototype objects;
- enumerable own string data properties;
- no symbol properties;
- no accessors;
- no custom prototypes.

Scalar leaves use the cbor-x value corpus already validated elsewhere.
Date/RegExp/Set/Map may exist as scalar-like value leaves in an independent
response, but this first path-index pilot does not traverse through them to
discover returnable nested identities.

The operation is read-only with respect to the indexed argument graph. Mutation
reconciliation is outside this experiment.

## Frozen path protocol

After cbor-x decodes the request argument array, Node traverses each admitted
argument graph in deterministic argument/order-of-enumerable-keys order.

For every encountered object it records the first path:

`{arg:<top-level-index>,keys:[<own-string-key>, ...]}`.

A WeakSet prevents cycles from causing repeated traversal. Shared aliases keep
the first path.

Response behavior:

1. if the result is a decoded argument object or reachable indexed nested
   object, encode `{kind:'path',arg,keys}`;
2. otherwise encode `{kind:'value',value:result}`;
3. the client resolves a path token against its original argument using only
   own data properties; missing keys or accessors cause refusal;
4. the client must not infer identity by comparing serialized values.

The protocol preserves exact original identity for a returned reachable object.
It does not preserve original identities embedded inside a newly created
response object.

## Frozen semantic observations

Require:

- `echo(root) === root`;
- returning `root.records[0]` yields the exact original first record object;
- returning an aliased nested object yields the exact original object even when
  several paths exist;
- root self-cycle does not break indexing;
- a sparse Array hole remains absent after request decode;
- own `undefined`, `NaN`, signed zero and a large `BigInt` remain
  observable server-side;
- a new independent response object roundtrips as a new value;
- enumerable getter input is refused by the path index;
- custom-prototype input is refused by the path index.

## Frozen performance workload

Use one top-level argument object containing either **1** or **32**
deterministic record objects. The timed task reads the records, performs
**25,000** deterministic integer-mixing rounds, and returns the **first nested
record object** on every call.

Compare:

- `native`: direct task;
- `cborValue`: ordinary cbor-x request encode/decode, task, full cbor value
  response encode/decode;
- `rootToken`: the prior top-level token logic, which cannot match the nested
  result and therefore falls back to a value response;
- `pathIdentity`: cbor-x request encode/decode, decoded-argument path indexing,
  task, compact path response and resolution to the exact original nested
  object.

Each retained sample performs **4,096 calls**. Warm all arms, then retain
**12 balanced-order paired samples** per payload size on Ubuntu and Windows.
Record raw process user+system CPU microseconds and checksums. Every native
sample must be positive.

For `pathIdentity/native`, **any evaluable paired ratio above 2.5x is a strict
veto** for that tested payload size. Passing medians cannot override a strict
breach.

## Decision

A useful passing result requires every semantic observation and zero strict
`pathIdentity/native > 2.5x` pairs at both one and 32 records on both tested
operating systems.

Passing would justify a separate conservative static proof that allows an exact
nested-input return while still refusing mutation, escape, and fresh response
objects that embed original aliases. It would then require real Chromium and
binary-HTTP integration.

A semantic mismatch or any strict runtime breach rejects this exact path-index
fast path for the affected workload.

No result changes **RELEASE-BLOCKED** or the established same-account SCO relay
boundary.
