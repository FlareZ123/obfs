# Safe reflective property-renaming extension charter

**Agent 5, 19 November 2026. Status:** design charter. No implementation claim.

## Problem

The current closed-world property analysis correctly declines ambiguous
reflection. New regressions in `test/feature-directed-semantics.test.js` and
`test/cross-reflection.test.js` preserve exact behavior for
`Object.hasOwn`, `Reflect.get`, descriptors, and key enumeration.

That conservative boundary protects correctness while leaving optimization
yield available in a narrower class of direct constant-key reflection.

## Candidate positive class

A future extension may consider a reflective call transformable only when all
of the following are proved from the closed supplied graph:

1. the receiver object is already a rename-safe tracked owner;
2. the queried property key is a compile-time exact string matching the
   candidate field;
3. the reflective intrinsic is statically identified and cannot have been
   shadowed, reassigned, rebound, or replaced before the call;
4. the owner cannot be a Proxy or another external/exotic object whose trap
   observes the original property spelling;
5. the reflective result does not publish the key spelling through another
   channel;
6. every direct and cross-file use of that owner/key is transformed
   consistently.

Potentially rewritable forms, subject to those proofs:

- `Reflect.get(owner, "field")`;
- `Reflect.set(owner, "field", value)`;
- `Reflect.has(owner, "field")`;
- `Object.hasOwn(owner, "field")`;
- `Object.getOwnPropertyDescriptor(owner, "field")`;
- `Reflect.getOwnPropertyDescriptor(owner, "field")`;
- `Reflect.deleteProperty(owner, "field")`.

The field definition, ordinary member accesses, and the literal reflective key
must all receive the same renamed spelling.

## Required negative classes

The extension must continue to refuse at least:

- mutable aliases such as `const get=Reflect.get` when subsequent mutation or
  call provenance is not fully proved;
- monkey-patched `Reflect.get`, `Object.hasOwn`, descriptor methods, or the
  global `Reflect`/`Object` bindings;
- dynamic keys;
- owner escape to unknown callees;
- Proxy construction or unknown proxy provenance;
- getters/setters whose external behavior exposes original key strings;
- source/name/stack observers when the surrounding rewrite changes those
  observables;
- reflective calls arriving through `call`, `apply`, `bind`, computed
  method names, destructuring, or global aliases unless those shapes receive
  their own proof.

## Enumeration is a different problem

`Object.keys`, `Object.getOwnPropertyNames`,
`Object.getOwnPropertyDescriptors`, `Reflect.ownKeys`, `for...in`, and
similar operations publish collections of property keys.

Rewriting the underlying field changes the returned string set. Preserving
behavior requires proving every consumer of that key collection and
consistently translating key comparisons, serialization, sorting, logging,
external calls, and other observations.

Do not treat enumeration as a constant-key reflection variant. A safe
enumeration transform needs its own whole-flow proof.

## Preregistered falsification

Before implementation, add test-only red witnesses for each positive form in
both local and closed ESM graphs. Preserve the pre-fix failure.

Then require negative regressions for:

- monkey-patched intrinsic;
- aliased intrinsic mutated after capture;
- Proxy owner whose trap records the key;
- exported owner observed by an external callback;
- dynamic key;
- enumeration result serialized to JSON;
- descriptor result containing getter/setter functions;
- inheritance/prototype fallthrough;
- cross-file owner alias and function-argument round trip.

A successful implementation must execute native and transformed programs in
real Node ESM and compare exact observable output.

## Security interpretation

This extension is primarily semantic-preservation and size/readability yield.
It should receive no static-deobfuscation credit merely because a property was
renamed. A source-aware attacker can ordinarily recover consistent reflective
key mappings from the emitted program.

Promotion therefore requires a correctness/yield metric, while obfuscation
resistance remains a separate dimension.
