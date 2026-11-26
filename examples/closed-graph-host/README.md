# Complete static ESM host graph: actual COO before and after

`before/` is a three-module ESM application. The entry imports logic,
which imports a private object. Each module body records a visible event;
the final value is 24.

The exported `read()` wrapper in the logic module delegates each field
read to a separate private, direct-call-only reader. Their parameter
bindings use distinct names so the conservative name-keyed alias inventory
can prove each owner edge without merging unrelated function-scope bindings.

`after/` contains **the actual compiler-emitted files** with opt-in
`mode:'coo'`, `closedWorld:true`, `allowedHosts:['allowed.example']`,
`seed:'agent15-closed-module-host'`, `strings:false`, and
`identifiers:false`. Both private property names are also consistently
rewritten across the graph (**2/2**). Every emitted module begins with its
own hostname guard before any body side effect.

Run `node examples/closed-graph-host/build-sample.cjs` from the repository
root to verify each byte and execute the original, authorized emitted and
denied emitted module groups in real Node 22 ES module loaders. The denied
test observes **zero module-body events**. Additional tests cover cycles,
side-effect imports, named reexports and refusal of undeclared external
dependencies.

This capability requires a genuinely complete declared static ESM graph.
Opaque or unsupplied static imports are refused. Dependency retrieval,
parsing and linking can still occur before the first body guard; the claim
is limited to JavaScript module **body** side effects in the declared graph.

The hostname is checked in untrusted client code. A fully controlling
attacker can alter, remove or spoof the guard and can recover the hashed
private field names. This example demonstrates a correct guarded evaluation
boundary under an honest runtime. It does not prove strong authorization,
confidentiality, anti-debugging or universal 2.5x performance.
