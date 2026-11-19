# Preregistration: JSON graph/identity SCO envelope

**Agent 6, 19 November 2026. Frozen before execution.**

## Hypothesis

The production SCO JSON transport has two separate semantic gaps:

1. JSON does not represent cycles, shared graph identity, undefined, NaN,
   signed zero or BigInt.
2. A pure value clone cannot preserve the identity of a preexisting client
   object. In particular, native `await echo(x) === x`, while a normal RPC
   clone returns a distinct object.

A third-party structured codec can improve the first gap but does not by
itself solve the second. This experiment tests an application-owned JSON
envelope that assigns opaque per-call graph IDs, maps decoded server objects
back to those IDs, and reconciles post-call snapshots into the original
client objects before decoding the result.

This is a research codec, not a production change.

## Admitted data contract

The experiment deliberately admits only:

- null, booleans, strings;
- finite numbers plus tagged NaN, +Infinity, -Infinity and -0;
- BigInt and undefined;
- ordinary Arrays, including holes and enumerable string data properties;
- ordinary Object-prototype objects and null-prototype objects;
- cycles and shared references.

Every admitted object must have only enumerable own string data properties
apart from Array `length`. Accessors, symbols, functions, custom prototypes,
non-enumerable custom properties and unsupported scalar types are refused
before wire generation. Own `__proto__` is a data key and must survive without
prototype mutation.

This smaller contract is intentional. It is wider than current JSON trees
while remaining auditable.

## Identity and mutation checks

The frozen positive corpus requires:

- `echo(x)` returns the exact original client object;
- two references to one client object remain identical on the server;
- a self-cycle remains a cycle;
- -0, NaN, undefined and BigInt survive;
- own `__proto__` survives as an own data property;
- sparse Array holes remain holes;
- server mutation of admitted input objects is reconciled into the original
  client objects;
- a newly-created server result stays distinct from every original input but
  preserves its own internal aliasing/cycle.

Negative controls require rejection of a getter, symbol-keyed property and
custom prototype.

## Performance protocol

Compare three in-process paths on deterministic 1- and 32-record inputs:

1. native task;
2. ordinary JSON clone plus task;
3. graph/identity envelope: encode -> JSON stringify/parse -> server decode ->
   task -> response encode including post-call input snapshots -> JSON
   stringify/parse -> client reconciliation.

The task adds 25,000 integer-mixing rounds per call. Each sample performs
2,048 calls. Collect 12 balanced-order samples, assert equal checksums, and use
the repository paired-budget diagnostic. Retain raw samples.

This intentionally counts both directions of envelope work but excludes HTTP,
authentication, browser module loading, network latency and production
compiler integration. Any identity/native pair above 2.5x vetoes the tested
workload under the repository's strict rule.

A passing result justifies a real browser/HTTP prototype. It does not widen the
production partitioner's contract.
