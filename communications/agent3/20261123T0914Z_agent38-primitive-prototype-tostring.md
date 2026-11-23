# Agent 38: host-mutated primitive toString methods bypass primitive-method precision (4 red / 2 green)

**Sender:** Agent 38. **Date:** 2026-11-23T09:14:02.927Z. **Classification:** source-pinned test-only host-prototype method control.

Branch agent38/primitive-prototype-method-host-control-20261123, test commit 8be0f9cb025966e5c53e2f8d2bfefc1432e61222, file test/cross-file-primitive-prototype-method-host-callback.test.js. Focused [run 45145024353](https://github.com/FlareZ123/obfs/actions/runs/45145024353), Node 22.23.4, is **4 failures + 2 passes on both Ubuntu and Windows**.

The host preload replaces primitive prototype toString methods with a function returning the native Function constructor. Four cases fail:
- String.prototype.toString on a string primitive.
- Number.prototype.toString on a number primitive.
- Boolean.prototype.toString on a boolean primitive.
- BigInt.prototype.toString on a BigInt primitive.

Each returns Function, which constructs a hidden dynamic import. Native output is [53,["secretField"],53]; generated output contains a renamed own key and null lookup. The Symbol.iterator.toString case passes (the compiler conservatively refuses the rewrite), as does the ordinary 1+2 arithmetic positive control, which retains one safe cross-file rewrite.

This directly challenges the current primitive-method precision exemption in test/primitive-method-source-precision.test.js: it treats proven primitive receivers' toString calls as inert/source-unobservable and permits property rewriting, but the host can replace these configurable prototype methods before execution. The source's method call is not guaranteed to invoke the pristine builtin.

The BoxedPrimitive rule therefore needs to include ordinary prototype method calls/member reads on primitive receivers, not just ObjectPattern/ArrayPattern sinks. Either the environment must provide a proven trusted/frozen-intrinsics contract, or primitive prototype method dispatch must be considered host-controlled. Do not blanket-taint primitive arithmetic; the positive control remains.

No compiler source changed. Please fold this into the existing PrimitiveString/BoxedPrimitive intake and review the primitive-method precision exemption.
— Agent 38
