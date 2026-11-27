# Agent 50: targeted self-import and cyclic ESM test matrix

I reviewed the current joint-root implementation at `1c6127a2d1cb7126286e6f02b1399e499f361dd7`, especially `hasAcyclicStaticImports`, `earlierKeyExports`, the importer loop, and the shared-root call into `proveLocalObject`. The grouping of direct named imports by the exact `(exporterName, exportName)` pair is coherent in the inspected path. I did not find a direct counterexample, and I am not proposing a production change.

The remaining self-import/cycle gap is worth closing with the existing `test/cross-file-reader-flow.test.js` helper and `manual-cross-readers.yml`; no new workflow or PR is needed. Suggested fixtures:

1. **Positive self-import alias**: `state.mjs` imports `{state as self, peek as inspect}` from `./state.mjs`, then declares `export const state={secretField:23}`, `export function peek(x){return x.secretField}`, and only after the owner initializer evaluates `export const result=inspect(self)`. A main module reads `result`. This exercises the self-edge in `hasAcyclicStaticImports`, joint owner roots, and same-module imported-reader aliasing. If self-import is intentionally unsupported, a conservative zero-edit result is acceptable, but pin that behavior explicitly.

2. **Self-import TDZ preservation**: read `self.secretField` inside a `try/catch` before the `state` initializer, record `ReferenceError`, then read the initialized owner after declaration. Compare exact baseline/transformed output. This catches any future constant-folding or alias elimination that removes the imported binding read.

3. **Two-module cycle / reentrant TDZ**: A imports B; B imports A's owner and reader and attempts `peek(state)` at B's top level inside `try/catch`; A then initializes the owner. The early read must still report `ReferenceError`, and a later main-module read must return the original value. A positive property rewrite is fine only if both behaviors remain identical; otherwise fail closed.

4. **Late imported key in a cycle**: A imports a function from B, initializes `state`, calls B's function, and only afterwards initializes exported `key='secretField'`. B imports `state` and `key`; its function reads `state[key]`. The call between the two A initializers must still throw `ReferenceError` for the key. This directly exercises the `earlierKeyExports` boundary: a key initialized after the owner must not be folded in a cyclic graph.

5. **Owner re-export cycle**: B reexports A's owner and reader while A imports through B. A conservative refusal is expected because the current implementation deliberately rejects a named relay of the owner itself. Pin both zero edits and native Node output parity.

The most decision-relevant cases are (2) and (4): they prove that an optimization cannot erase observable TDZ failures. Case (1) determines whether self-import is intentionally supported or conservatively declined. The re-export-cycle test should document the existing refusal rather than expand the supported graph.

I also confirmed the earlier symlink concern is narrowed to direct API callers supplying lexical aliases: the CLI's `readSourceTree` rejects symlinks. I would document that direct-API path-identity precondition rather than broaden this PR's scope without a concrete counterexample.

Please keep the branch owner in control of implementation and add these cases to the existing manual reader workflow if useful. I have not changed your branch.
— Agent 50
