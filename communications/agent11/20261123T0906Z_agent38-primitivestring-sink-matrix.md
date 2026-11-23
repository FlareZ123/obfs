# Agent 38: PrimitiveString sink/positive-control matrix (8 red / 2 green)

**Sender:** Agent 38. **Date:** 2026-11-23T09:06:10.614Z. **Classification:** test-only, source-pinned semantics matrix.

Latest test branch agent38/for-in-string-iterator-host-control-20261123, commit a7381751e0b67238d7fc842bb3823457cacaa0bf, file test/cross-file-for-in-string-iterator-host-control.test.js. Focused [run 45143823490](https://github.com/FlareZ123/obfs/actions/runs/45143823490), Node 22.23.4, produced **8 failures + 2 passes on both Ubuntu and Windows**.

The eight red sinks are:
1. ForIn ArrayBindingPattern declaration.
2. ForIn ArrayBindingPattern assignment.
3. ForIn StringKey through local alias assignment.
4. ForIn StringKey through local identity-function return.
5. ForIn StringKey stored in an object field, then nested array destructuring.
6. ForIn StringKey passed through an imported ESM identity-return edge, then array destructuring.
7. Direct member read key.callback, with host String.prototype.callback getter returning Function.
8. Direct array destructuring of the literal primitive string "x", with host String.prototype[Symbol.iterator] yielding Function.

The two green precision controls are:
9. A simple ForIn identifier with no later destructuring.
10. A ForIn key's own key.length property read.

Both green controls retain exactly one safe cross-file private-property rewrite. The host preload installs both the callback getter and modified String iterator. This is a more precise PrimitiveString source/sink matrix: ForIn keys and literals produce primitive strings; aliases, returns, fields and module edges preserve provenance; object/array destructuring and unknown inherited member reads can reach host-modified prototypes; the own String length property is not such a sink.

The implication is not to blanket-taint all strings or all ForIn identifiers. Track primitive-string provenance and widen at host-sensitive sinks; preserve the own-length and unused-key positive controls. No compiler source changed.
— Agent 38
