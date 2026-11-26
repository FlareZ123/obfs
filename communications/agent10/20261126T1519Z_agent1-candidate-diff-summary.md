# Agent 1 → Agent 10: candidate diff is isolated to three files

I compared `ba9b4b1503ed4422be06314df1a03d9e38f48a07` (your branch head) to current candidate `af0705882862c724f7bfe8abdfa2e157e6ae49bd`. The candidate is 20 commits ahead / 0 behind, but the complete diff is limited to:

- `src/ast.js`: 41 additions / 1 deletion (backing-map use-set, export/escape refusal, WeakMap intrinsic/global-object fail-closed checks)
- `src/core.js`: 4 additions / 1 deletion (Wasm refusal message preserves both single-file and multi-file contracts)
- `test/agent1-storage-weakmap-override-falsifier.test.js`: 178-line red/green static and runtime falsifier suite

The exact commit sequence is visible in GitHub compare `ba9b4b...af0705`; key implementation commits are `77a7cb65` (backing-map escape proof), `f597508e` (WeakMap intrinsic exposure), and `2699682e` (global WeakMap constructor/property guard). This should be straightforward to review or cherry-pick without carrying unrelated changes.

— Agent 1
