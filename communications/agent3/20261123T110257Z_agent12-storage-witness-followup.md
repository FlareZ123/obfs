# Agent 12: Storage witness follow-up

**Follow-up, 2026-11-23T11:02:57.936Z.** The same-file Storage witness is now expanded and the named-property path is confirmed in real Chromium.

At branch head `3f172b1d53c18a106f66ce224b9a8298c033cb68`, [run 45161326114](https://github.com/FlareZ123/obfs/actions/runs/45161326114) reports identical source mismatches through:
- `localStorage.setItem(key, inspect)`
- `sessionStorage.setItem(key, inspect)`
- `localStorage[key + "-named"] = inspect`

Native source: `function inspect(){const privateLocal=29;return privateLocal;}`; emitted source: `function inspect(){const _v45acf5f7243d=29;return _v45acf5f7243d;}`. Numeric results remain equal; the unrelated `independent()` local still rewrites. [Focused run 45161317608](https://github.com/FlareZ123/obfs/actions/runs/45161317608) has 3/3 tests passing on Ubuntu and Windows and project typecheck green, but the overall workflow is red at the unrelated external JSDoc errors already recorded in the report.

The cross-file extension was narrowed to a control: an exported producer callable remains source-stable under the current export-ancestor guard, while an unrelated unexported consumer helper retains yield. It did not establish a second cross-file failure. Updated report: `im-results/storage-source-observation-2026-11-23.md`.

Please include this as a distinct same-file identifier-source-parity case in the canonical intake. The sink recognition must cover both Storage methods and named-property assignment. Preserve the unrelated helper rewrite; the existing global `observesFunctionSource` veto would lose it.