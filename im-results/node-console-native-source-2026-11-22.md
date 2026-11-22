# Native Node console displays and labels leak callable source without explicit reflection

**Agent:** 2. **Date:** 2026-11-22. **Status:** Three-mode deterministic source-parity defect, corrected with a two-platform focused red/green. **Classification:** Intermediate clean-runtime compatibility evidence; the primary security release remains blocked.

## Mechanism

Several native Node console methods omitted by the earlier source-observer set display function names or source. The official [Node console API](https://nodejs.org/api/console.html) describes table rendering, assertion and group formatting, and count labels. Actual Node 22 prints function names from nested record values in table/group/assert/dirxml, and prints the entire function source as the label of count. Identifier renaming and rewritten function-body literals consequently change observable stdout/stderr even though ordinary computation may be identical. None of these source observations requires an explicit function-toString, function-name, or error-stack property read.

For example, the test creates a function named exactNativeCallableName, passes it in a record to console.table, and also passes the function directly to console.count. The former displays the function name in a table cell. The latter displays the complete function source and the current count.

Before correction, the native method set in src/ast.js covered trace, log, info, warn, error, debug and dir, but omitted table, assert, dirxml, group, groupCollapsed, and count. Existing recursive literal-container analysis was already capable of detecting function-valued arguments. The correction extends the native method name set with these formatters, plus countReset, time, timeLog, timeEnd, timeStamp, profile and profileEnd for label coercions and inspector-visible sources. The existing logger alias, destructuring, and bind analysis is reused. The change is entirely compile-time classification; no additional obfuscated runtime operations are inserted.

## Exact red/green validation

- [RED two-platform focused run 45021384698](https://github.com/FlareZ123/obfs/actions/runs/45021384698), at test-only source 1901f9e7c3e3f2131952dd5faae7d2b5d3e0f1b0: Source-observer assertions failed in SCO/COO/SNO for the omitted native methods on Ubuntu and Windows. Primitive-only table is a separately scoped positive control.
- [GREEN two-platform focused run 45021459217](https://github.com/FlareZ123/obfs/actions/runs/45021459217), at corrected source 8e55bc482beb19af9c74fbbcffc5388daf4d01b0: 8 source-observation fixtures across three modes and 3 positive-yield controls passed on Node 22 Ubuntu and Windows, including both strict project and external JSDoc gates.

The test test/node-console-source-display.test.js executes original and emitted CommonJS in fresh actual Node processes using the Node child-process API. It compares process status, stdout, and stderr. Fixture settings exercise identifier/string source rewrites, while the primitive table positive case exercises verified private-property renaming.

## Limitations

The fixture validates the listed native Node console methods. User-patched console objects, arbitrary dynamic methods, hostile runtime instrumentation, and browser-specific output require separate analyses. Focused verification is smaller than full source-coincident Node/Chromium integration; no 2.5x compute or adversarial security gain is claimed. The primary release verdict remains RELEASE-BLOCKED.
