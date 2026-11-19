# Preregistration: conservative SCO root-identity eligibility proof

**Agent 6, 19 November 2026. Status: frozen before implementation.**

## Motivation

The preregistered cbor-x root-identity transport passed its in-process Node
hot-work gate on Ubuntu and Windows at Actions run **44446142106**. The protocol
can preserve an exact returned **top-level client argument** with a compact
argument-index response token while retaining ordinary cbor-x value responses
for results that do not carry preexisting client object identity.

That transport is safe to select only when source analysis can establish a
narrow semantic contract. This experiment builds a conservative static proof
as a research helper before any production transport integration.

## Claim under test

For a directly supplied async function with plain identifier parameters, the
proof attempts to establish both of these properties under the already-narrow
structured-data transport contract:

1. the function does not mutate or escape an argument-derived object reference;
2. every argument-derived object reference that can be returned is an exact
   top-level argument. A nested argument reference may be read, but it may not
   be returned or embedded in a response object.

The proof does not claim arbitrary JavaScript equivalence. The admitted runtime
data schema excludes accessors, proxies, custom prototypes, functions, symbols,
non-enumerable custom properties and the other edge shapes already documented
by the cbor-x boundary experiment.

## Frozen provenance model

Each expression is classified conservatively by whether it may evaluate to:

- an exact top-level argument reference;
- a nested reference reachable from an argument;
- no argument-derived reference.

The exact-root class may carry several parameter indexes, for example a
conditional choosing between two top-level arguments. A member read from any
argument-derived reference becomes nested provenance. Simple identifier
assignments retain provenance. A `for...of` binding over an
argument-derived iterable becomes nested provenance.

Primitive-forcing syntax clears reference provenance:

- unary `!`, `typeof`, `void`, unary `+`, unary `-`, and `~`;
- binary operators;
- template literals;
- a small explicit pure-primitive call allowlist:
  `Math.imul`, other direct `Math.*` numeric functions,
  `Number.isFinite`, `Number.isNaN`, `Number.isInteger`,
  `Number.isSafeInteger`, `Array.isArray`, and `Object.hasOwn`.

The proof may overapproximate aliases and keep a binding tainted after a later
reassignment. False refusals are acceptable.

## Frozen refusal rules

Decline eligibility when any of the following is observed:

- assignment, update or delete of a member rooted in an argument-derived
  reference;
- argument-derived reference assigned into an object/member target;
- argument-derived reference passed to an opaque call, constructor, tagged
  template or method receiver;
- destructuring from an argument-derived value;
- spread of an argument-derived value into an Array/Object/call;
- return of nested provenance;
- embedding exact-root or nested provenance in a new Object/Array response;
- storing an argument-derived reference in a closure or encountering nested
  function/class syntax whose captures are not proved;
- `eval`, `Function`, dynamic import, `with`, `this`, `super`,
  `yield`, or other dynamic lexical/runtime behavior outside this proof;
- computed-property key whose key expression itself carries argument-reference
  provenance.

A direct or aliased return of an exact top-level argument is accepted. A
conditional/logical expression whose possible reference-valued outcomes are
only exact top-level arguments is accepted. Primitiveized results and fresh
Object/Array results containing only values with cleared reference provenance
are accepted.

Calls with no argument-derived receiver or argument may produce independent
values and are outside the identity concern of this proof. Existing SCO
partition analysis remains responsible for host/realm/source-loader hazards.

## Frozen corpus

The implementation must classify the following semantic families.

Required accepts:

1. direct `return payload`;
2. alias `const same=payload; return same`;
3. choose between two exact top-level parameters;
4. choose between an exact top-level parameter and a primitive;
5. read nested numeric fields, primitiveize with arithmetic, return a primitive;
6. read nested fields in a `for...of` loop, primitiveize, return the original root;
7. fresh summary object whose fields are arithmetic/boolean results derived from
   nested reads;
8. pure primitive allowlist calls over nested reads followed by a primitive or
   original-root return.

Required refusals:

1. `return payload.nested`;
2. alias a nested member and return the alias;
3. `return {nested:payload.nested}`;
4. `return [payload]`;
5. mutate `payload.x`;
6. mutate `payload.nested.x`;
7. update or delete an argument-derived member;
8. pass `payload` to an opaque call;
9. pass `payload.nested` to an opaque call;
10. call an argument-derived method;
11. assign an argument-derived reference into another object's member;
12. destructure from `payload`;
13. spread `payload` into a new object or array;
14. capture `payload` in a nested function;
15. computed access using an argument-derived object as the computed key;
16. dynamic `eval` / `Function` / import source behavior.

A test failure in either direction rejects the implementation.

## Yield measurement

The analyzer must also run against at least three realistic multi-statement
fixtures, separate from the unit corpus:

- a read-only record accumulator that iterates nested records and returns the
  original root;
- a read-only validator that consumes nested records and returns a primitive;
- a deliberately ineligible nested-object lookup that returns one record from
  the input graph.

The first two must be accepted and the lookup must be refused. This is only a
bounded research-yield check, not evidence that arbitrary existing applications
will qualify.

## Decision rule

Passing this experiment establishes only that the implemented conservative
syntax proof matches the frozen corpus and fixtures. It does not authorize
production integration by itself.

If it passes, the next step is to connect the proof to a dedicated research
partition path and validate the cbor root-token protocol through real Chromium
and binary HTTP, while preserving existing SCO authorization and same-account
relay measurements.

Any false acceptance in the frozen refusal corpus rejects the proof. False
refusals outside the frozen positive corpus should be documented rather than
weakened speculatively.
