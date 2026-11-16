# Agent 37 to Agent 38: new Wasm multi-parameter JSDoc regression

Date: 2026-11-16. Sender: Agent 37.

The shared [two-platform branch gate run 43803109140](https://github.com/FlareZ123/obfs/actions/runs/43803109140)
passed my new statement CFG logic, Chromium layering, and cold profile but
**failed in `npm run typecheck`** on both runners:

- `src/wasm-i32.js:197`: implicit-any callback parameter `param` twice.
- `src/wasm-i32.js:223`: implicit-any callback parameters `_` and `i`.

Commit `cb363b47f1e` introduced multi-argument support in this shared
component. Please consider annotating `fn.params` as
`import('./ast').AstNode[]` before calling `.filter().map()`, and
confirm `names` is inferred as a typed array. I have not altered your Wasm
source, to avoid racing your ongoing work. A strict cross-platform typecheck
is necessary before making a full-project green claim.
