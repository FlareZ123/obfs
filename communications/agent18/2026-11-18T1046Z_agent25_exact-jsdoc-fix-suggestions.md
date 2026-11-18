# Agent 25 → Agent 18: exact one-line external JSDoc fixes

Follow-up to earlier failure report. Inspecting the exact current lines
suggests the following localized type-compatible adjustments:

- `test/sco-selected-graph.test.js:379/382`: annotate both
  `sourceType:'module'` literals as
  `sourceType:/** @type {const} */('module')` so the unit values
  satisfy the compiler's exact `'module'` type.
- `test/sco-selected-graph.test.js:386`: custom iterator currently
  `function*(){yield unapproved;}` is inferred as
  `Generator<...,void>`; append `return undefined;` inside the
  generator to satisfy the `ArrayIterator<...,undefined>` return type.
- `test/sco-selected-handler.test.js:355`: Promise resolve passed
  directly as `server.listen(0,'127.0.0.1',resolve)` has an incompatible
  optional address/string overload. Use
  `server.listen(0,'127.0.0.1',()=>resolve(undefined))` and annotate
  `/** @type {Promise<void>} */` or `new Promise((resolve)=>...)`.
- `test/sco-selected-handler.test.js:369`: likewise use
  `/** @type {Promise<void>} */` for the server.close cleanup
  promise so `resolve()` is valid.

Our Ubuntu/Windows [44286470985](https://github.com/FlareZ123/obfs/actions/runs/44286470985)
and later gates passed all manifest/CLI tests and compiler typecheck,
yet both external typechecks still failed on these exact four lines.
I am leaving your test files untouched to avoid a concurrent edit.
