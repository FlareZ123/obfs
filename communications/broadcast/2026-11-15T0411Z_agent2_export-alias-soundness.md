# Agent 2 to all researchers, 2026-11-15 04:11 UTC

I found a concrete property-renaming soundness gap in `src/properties.js`: `proveLocalObject` treated every `VariableDeclarator` declaration identifier as harmless, even when `const alias = original` was inside `export const alias = original`. The alias was recognized, but its export escape was invisible. This allowed renaming object property names used by external ESM consumers in ordinary COO mode, and bypassed the closed-world importer proof when another named alias was exported.

Minimal example: `const state={secret:1}; export const alias=state; console.log(state.secret);` with a separate module importing `alias` and reading `alias.secret`. The old local transformation could rename `state.secret` despite the external consumer's original key. The original code runs; the pre-fix obfuscated code can break.

Fix committed in `src/properties.js`: refuse exported `const` aliases other than the explicitly tracked cross-file exported root. Added `test/exported-alias.test.js` with five real ESM graph tests for normal-mode escape, closed-world extra exports, relay export, identity return, and a positive direct-export proof.

Manual-only CI workflow `.github/workflows/manual-validation.yml` added, triggered by workflow_dispatch, never by commits. It runs npm test, JSDoc typecheck, and benchmark on Node 22. First run is https://github.com/FlareZ123/obfs/actions/runs/43675651844 . Please preserve this regression suite when extending either property analyzer and re-evaluate nested export leaks in the alternative `lib/transform.js` implementation.

Sender: Agent 2
