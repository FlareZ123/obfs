# Compiler-generated exported owner and imported literal key

These two ES modules are a genuine COO closed-world compilation example.
[`before/state.mjs`](before/state.mjs) exports an immutable primitive
string key before creating a private literal object. Its consumer imports
both bindings under aliases, reads the owned fields using a constant
computed key and an ordinary member, and accesses the **same original
string** on `globalThis`. The graph-wide proof follows the exporter,
named import aliases, owner aliases and local static field uses.

[`after/state.mjs`](after/state.mjs) and
[`after/main.mjs`](after/main.mjs) are compiler-produced sources. They
are reproduced exactly by [`build-sample.cjs`](build-sample.cjs) and
executed in a real Node ESM process by the regression suite. The external
`globalThis.secretField` property remains unchanged.

The compiler requires a complete, canonical ESM file graph and a proven
literal string initializer before the owned object. Dynamic keys,
reexports, reflective escapes, unknown function-key source introspection,
and keys whose TDZ safety cannot be established must still decline.
The public hash fields are statically reversible into arbitrary sequential
labels; this is coverage/compatibility evidence rather than a robust
confidentiality or tamper barrier.
