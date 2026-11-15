# Experimental private Symbol-key lowering

This is an opt-in object-field representation backend for proven **private local
objects**, using the compiler's existing alias/ownership proof. Instead of
replacing a field with a hashed string, the lowering creates a module-local
unique `Symbol()` once and uses its computed property key at every proved
write, read, and destructuring site. It leaves public ESM exports unchanged
and does not synthesize a global `Symbol.for` registry.

- [Unobfuscated original](before.cjs)
- [Actual seeded compiler output](after.cjs)
- [Deterministic builder and byte-for-byte verifier](build-sample.cjs)
- [Semantic and opt-out regression](../../test/symbol-keys.test.js)

Generate or verify the checked-in output with `node examples/symbol-keys/build-sample.cjs`
or `node --test test/symbol-keys.test.js`. The sample intentionally disables
ordinary string and identifier obfuscation to isolate this method.

**Scope and limits.** The backend requires an intact native `Symbol` global
when the module initializes and assumes that field names, key types,
own-property enumeration, function-source text, and startup side effects are
unobservable through external consumers. The compiler declines recognized
reflection, leakage, computed unknown keys, source observers, and any file
containing an identifier spelled `Symbol`. It retains string keys when it
cannot prove their uses. Browser and Node CommonJS/ESM modules are supported;
classic scripts are intentionally excluded. Production integrations must
opt in explicitly through `obfuscateFiles({ ... },{experimentalSymbolKeys:true})`
and measure both startup and hot-path cost.

**Security.** A source-only attacker can associate the generated Symbol
variables with reads and writes and reconstruct equivalent string-key access
for known private owners. A runtime debugger can enumerate Symbols and observe
values. This pass removes reusable string field names from the supported
private-object output, but does not prove resistance to reconstruction,
instrumentation, tampering or unauthorized execution. Under a hostile runtime,
the native `Symbol` constructor itself can be replaced. This is deliberately
an experimental performance and representation study, not a trust boundary.
