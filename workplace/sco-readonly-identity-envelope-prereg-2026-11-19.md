# Preregistration: read-only identity-token SCO envelope

**Agent 6, 19 November 2026. Status: frozen before execution.**

## Motivation

The full two-way JSON identity envelope in `im-results/sco-json-identity-envelope-2026-11-19.md`
preserved the targeted graph and preexisting-client-object identity semantics, but its
post-call input reconciliation produced strict 2.5x runtime vetoes even for one record
and was decisively over budget for 32 records. The cbor-x structured-wire pilot showed
that coarse read-only structured calls can fit the hot recurring budget, but a plain
codec clone cannot make a server-returned reference equal an already-existing client
object.

This experiment tests one narrower contract: **arguments are read-only for the selected
private operation**. Because admitted operations do not mutate the client graph, the
response need not ship post-call snapshots. The server instead preserves opaque IDs for
objects decoded from the client request and may return a compact token referring back to
one of those original objects. New server-created response objects are encoded normally
and may themselves contain references back to original client objects.

This is a transport/compatibility experiment. It does not add anti-relay security and
does not modify production SCO.

## Frozen semantic contract

The research envelope admits the same bounded value family as the earlier JSON identity
pilot: null/boolean/string, ordinary numbers plus tagged special numeric values,
`BigInt`, `undefined`, Arrays, ordinary Object-prototype objects and null-prototype
objects. Custom properties must be enumerable own string data properties. Accessors,
symbols, functions, custom prototypes and non-enumerable custom properties are refused.

The client assigns stable IDs `cN` while encoding the request graph. The server decodes
fresh objects and records each decoded object -> `cN` mapping. Response encoding works
as follows:

1. if a returned object is one of the decoded request objects, emit only a client-reference
   token for its existing `cN`;
2. otherwise allocate a response ID `rN`, encode that new object once, and recursively
   permit either `rN` references or references back to `cN` objects;
3. the client resolves `cN` directly to the original pre-call object and allocates only
   `rN` nodes;
4. no post-call request-object snapshot or reconciliation is transmitted.

The selected operation is assumed read-only for this pilot. No runtime mutation trap is
credited as protection. A later production design would require a conservative static
proof or explicit refusal before selecting this fast path.

Required observations:

- `echo(x) === x`;
- returning `x.nested` yields the exact original nested client object;
- passing the same client object twice is aliased on the server;
- a self-cycle in the request remains a cycle server-side;
- sparse Array holes remain holes;
- `-0`, `NaN`, `undefined`, and a large `BigInt` survive;
- a new response object remains new, may contain a cycle/shared references, and may embed
  a reference to the exact original nested client object;
- own data `__proto__` is preserved without prototype mutation;
- an enumerable getter is refused.

## Frozen performance comparison

The timed operation receives one object with `records` containing either **1** or **32**
records. It reads those records, performs **25,000** deterministic integer-mixing rounds,
and returns the first input record object so that preexisting-object identity is exercised
on every call.

Compare four arms:

- `native`: direct call on the original object;
- `json`: ordinary `JSON.stringify` / `JSON.parse` then task, returning the cloned
  first record as a value-only control;
- `fullIdentity`: the already-tested two-way identity envelope, including post-call
  reconciliation;
- `readOnlyIdentity`: the new one-way request plus identity-token response.

Each sample performs **4,096 calls**. Warm each arm, then retain **12 balanced-order paired
samples** per payload size. Record raw process user+system CPU microseconds and checksums.
Every native sample must be positive.

For `readOnlyIdentity/native`, **any evaluable paired ratio above 2.5x is a strict veto**
for that tested payload size. Passing medians cannot override a strict breach. The full
identity arm is an explanatory same-protocol-family control and is expected to reproduce
its larger reconciliation cost; its exact result is measured rather than assumed.

## Decision rule

A useful result requires all required semantic observations plus zero strict
`readOnlyIdentity/native > 2.5x` pairs on both Ubuntu and Windows at both 1 and 32
records. Passing would justify a separate compiler-analysis experiment that proves a
selected SCO private export is read-only with respect to admitted argument graphs and
declines otherwise.

A semantic mismatch, zero native timing, or any strict runtime breach rejects this exact
fast path for the affected workload. No result from this pilot changes the current
RELEASE-BLOCKED security decision or the authorized same-account SCO relay boundary.
