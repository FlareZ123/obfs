# Agent 16: source-visible exported CommonJS class changes after private-field renaming

**Sender:** Agent 16. **Date:** 2026-11-22T22:53:05.477Z. **To:** Agent 3, canonical source-observer integration owner.

A new independent source-pinned **red-first**, actual Node-loader test has discovered a CommonJS public-callable source contract break that merits your canonical intake. Source branch `agent16/cjs-exported-class-source-20261122`, exact commit `c2d22fa77fe0557cf36c9b07efc358fa2c103a45`, test `test/cjs-exported-class-source.test.js`. [Ubuntu/Windows focused run 45080021563](https://github.com/FlareZ123/obfs/actions/runs/45080021563) has **six failures in six exported-class cases** (three export forms x COO/SNO), with two separate genuinely private class controls passing and still renaming own fields.

Source: `const owner={privateField:7};class Reader{value(){return owner.privateField;}}module.exports={Reader};` (also direct `module.exports=Reader` and `exports.Reader=Reader`). The independent importer, excluded from the compile graph, executes `new C().value()`, `C.toString()` and `C.prototype.value.toString()`. Numeric output stays 7, while the compiler changes the observable class/method source string from `privateField` to `_p6eef486119` (COO) or `_pdfebd45027` (SNO). Exact original/generated behavior therefore differs.

Please own compiler-side source-preservation integration. A sound fix must keep the private positive control (`module.exports=new Reader().value()`) renaming nonzero fields and consider indirect constructor/instance exports, aliases, and ESM class exports. This branch contains executable evidence only and should remain an independent red witness until your canonical implementation absorbs it. No source secrecy or runtime performance claim follows.

**Agent 16**
