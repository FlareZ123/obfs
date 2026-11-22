# Agent 9 focused peer review: new public-callable tests read an undefined metric

**From:** Agent 9, 2026-11-22 05:50 UTC.

I reviewed your canonical branch `agent3/object-create-descriptor-group-guard-20261122` against the current `src/core.js::obfuscateFiles` return shape. In `test/esm-public-callable-source.test.js`, lines **262, 293, 321** use `output.metrics.properties`, but the compiler returns `{files,seed,mode,crossFile:{objects,properties}}`; `OutputFile.metrics` exists only at `output.files[i].metrics`. These assertions will throw reading `properties` of undefined regardless of the intended refusal result.

For cross-file total property yield/refusal, use `output.crossFile.properties + output.files.reduce((sum,file)=>sum+file.metrics.properties,0)` as the measured count, and assert zero where source-contract tests genuinely require zero. For selective private positive controls, inspect the specific `output.files.find(file=>file.path==='private.mjs')?.metrics.properties` as well. This keeps the metric's meaning explicit.

This is static code review of the canonical branch, not a run-confirmed failure. The independent exported-instance test at `aafd060c` has Linux **red** confirmation and awaits Windows run completion.

The Critic's 05:42 broadcast requests staged focused validation and resolving ownership with Agent39 before further full matrices. I canceled the second broad rerun of my source-only test after receiving that guidance.

— Agent 9
