# Node diagnostic reports expose transformed source coordinates

**18 November 2026, Agent 1. Classification: intermediate compiler semantic-soundness evidence.** This work closes bounded Node diagnostic-report source-coordinate observers in `observesFunctionSource`. It provides no new confidentiality, anti-tamper resistance, runtime extraction resistance, or strong-protection release evidence.

## Mechanism

Node's diagnostic report API embeds a live JavaScript call stack. A program can observe it directly through `process.report.getReport().javascriptStack` or persist it with `process.report.writeReport()`. Programmatic automatic-report switches can also emit a later JavaScript stack on an uncaught exception, fatal error, or signal. Consequently, a length-changing property or identifier rewrite earlier on the same line can change an observable line/column even when supplied code never spells `.stack`.

The API is reachable through the global `process`, `require('process')` / `require('node:process')`, and ESM process-module imports. Ordinary assignment aliases, destructured `report` and `getReport` bindings, defaulted destructuring, bound methods, `.call/.apply`, and static `Reflect.get` / `Reflect.apply` forms preserve the same native capability.

## Frozen pre-fix counterexample

The corrected pre-fix branch `agent1-process-report-prefx-20261118`, exact source **`fb0f8e5858de64a0aea87be54e3620520f4f1a4a`**, runs a one-line CJS specimen with a genuinely transformable private property immediately before:

```js
JSON.stringify(process.report.getReport().javascriptStack)
```

The pre-fix compiler classified the file as source-observer-free, renamed the private field, and changed the report's `process-report-observer.cjs:1:<column>` frame. Full [manual validation 44382808382](https://github.com/FlareZ123/obfs/actions/runs/44382808382) completed successfully on Ubuntu and Windows because this branch intentionally asserts that the native and emitted report strings differ while the compiler performs a nonzero property rewrite. The same run passed the existing Node corpus and JSDoc gates, so the witness is source-pinned against otherwise-valid compiler behavior rather than an unrelated failing build.

## Guarded behavior

The patch tracks process-module namespaces, report namespaces, and `getReport` / `writeReport` method aliases through a monotone local proof. Covered forms include:

- global, CommonJS, and ESM process-module access;
- namespace, method, nested, and defaulted destructuring aliases;
- detached and bound report methods;
- `.call/.apply`, `Reflect.apply`, and static `Reflect.get` acquisition;
- direct assignment to `reportOnUncaughtException`, `reportOnFatalError`, and `reportOnSignal`;
- `Reflect.set` and `Object.assign` updates of those automatic-report switches, conservatively refusing opaque assignment sources.

The regression also preserves positive yield. Ordinary `process.pid` use and a harmless `process.report.filename` metadata write remain eligible for private-property renaming when no report stack is observed.

A child-process differential verifies the automatic-report path itself. It writes a fixed one-line CJS file atomically, enables `reportOnUncaughtException`, throws, reads the generated report, and extracts the frame for that script. Manually shortening the private field changes that native report frame. The compiler now refuses the corresponding source rewrite and preserves the original bytes.

## Final source-pinned validation

Post-fix branch `agent1-process-report-source-20261118`, exact source **`a7ac0dc9decd35e98d7077b8f2f09537987aacb7`**. Full [manual validation 44385238706](https://github.com/FlareZ123/obfs/actions/runs/44385238706) completed successfully on **Ubuntu and Windows**. Both jobs passed the complete Node behavioral corpus and both strict JSDoc/typecheck configurations; Ubuntu also passed the existing real-Chromium integration. The focused process-report regression covers direct, aliased, reflective, CommonJS, ESM, defaulted-destructuring, automatic-report, unsafe-manual-shortening, and positive-yield cases.

The test compares only frames belonging to the fixed synthetic source filename. Node's report also contains caller frames in the test harness, and those naturally differ when two executions occur on adjacent test-file lines; treating the whole JSON report as byte-identical would therefore be an invalid oracle.

## Boundary

This is a conservative compile-time compatibility guard. It does not prove that every possible reflective route to Node's report internals has been modeled. Ambient host configuration such as externally supplied `NODE_OPTIONS`, debugger tooling, or source observers outside the supplied program remains outside this finite AST proof. The running program receives no extra runtime work when the guard refuses transformation, so this repair does not create a new compute-budget burden. The repository's strong-protection release decision remains blocked.
