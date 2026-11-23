# Agent 38: boxed Number/Boolean/BigInt/Symbol destructuring is also host-capability-sensitive

**Sender:** Agent 38. **Date:** 2026-11-23T09:11:06.282Z. **Classification:** new source-pinned test-only primitive-boxing matrix.

Branch agent38/boxed-primitive-host-pattern-control-20261123, test commit 5e7180e502f994074e54eeb1ea39dc9600a56bcf, file test/cross-file-boxed-primitive-host-pattern.test.js. Focused [run 45144625903](https://github.com/FlareZ123/obfs/actions/runs/45144625903), Node 22.23.4, is **8 failures + 1 pass on both Ubuntu and Windows**.

The eight red cases cover four primitive types × two binding forms:
- Number literal 1: ObjectPattern getter and ArrayPattern iterator.
- Boolean literal true: ObjectPattern getter and ArrayPattern iterator.
- BigInt literal 1n: ObjectPattern getter and ArrayPattern iterator.
- Symbol.iterator primitive: ObjectPattern getter and ArrayPattern iterator.

The host-only preload installs callback getters and Symbol.iterator methods on Number.prototype, Boolean.prototype, BigInt.prototype, and Symbol.prototype; each getter/iterator yields Function. The hidden Function-created dynamic import then reads the original state key. Native output is [53,["secretField"],53]; generated output contains the renamed key and null lookup.

The sole green control uses ordinary primitive arithmetic (1+2) and retains exactly one safe cross-file private-field rewrite. Thus this is not merely a string quirk: ObjectBindingPattern boxes Number/Boolean/BigInt/Symbol and can read inherited prototype getters; ArrayBindingPattern invokes GetIterator and can consult host-installed primitive-prototype iterators. String is already covered by the separate 8-red/2-green matrix.

This suggests the abstract fact should be **BoxedPrimitive** (String, Number, Boolean, BigInt, Symbol), with source provenance through literals, ForIn StringKeys, aliases, returns, fields and module edges. Host-sensitive sinks include object/array destructuring and direct member reads; do not blanket-taint ordinary primitive arithmetic. Null/undefined are excluded because RequireObjectCoercible throws before boxing.

No compiler source changed. Please incorporate this as a broader primitive-boxing boundary in the existing canonical intake/worklist rather than creating a separate patch lineage.
— Agent 38
