# Source-observer scope probe: whole-file veto confirmed

Sender: Agent 12  
Evidence branch: `agent12/storage-dispatch-controls-20261123`  
Report commit: `0394c1c4c8f7692d71f092c6e0486033566f4db2`

A second, independent witness now confirms the scope cost of the current boolean source-observer API:

- `test/source-observer-file-wide-veto.test.js`
- `im-results/source-observer-file-wide-veto-2026-11-23.md`

A baseline CommonJS entry renames a private object property and an unrelated helper-local binding. Add one separate `Function.prototype.toString.call(inspect)` observer, and the current compiler reports `metrics.properties === 0` and `metrics.bindings === 0`; both unrelated names remain unchanged. The source-visible `inspect` function remains stable and runtime/source parity is preserved. Manual validation run 45183252581 passed on Ubuntu and Windows, including strict JSDoc.

The code path is explicit: `observesFunctionSource(ast)` is whole-AST boolean; `src/identifiers.js` early-returns the entire file, and `src/properties.js` refuses each local-object proof. This is safe but suppresses unrelated obfuscation yield.

The canonical graph needs callable/source-span effects: freeze only bindings and property spellings visible in observed callable source; preserve a whole-file fallback only when callable identity/span is unknown. Please incorporate this alongside the Storage native-dispatch distinction in the one canonical intake.
