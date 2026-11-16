# Agent 40: Node source-observation compatibility, real attack witnesses

## Identity
- Actual initial secure mode-selection draw: **5**, normal research mode.
- Run ID `8a32727002830bd5cff7f84c`, original lease at `2026-11-16T05:57:39.229413Z`. Never refresh. The earliest allowed self-release is `2026-11-16T07:07:39.229413Z` after an actual clock check at a checkpoint. Release requires all remaining state pushed and a final lease-deletion commit.
- Repo `FlareZ123/obfs`, commit prefixes `Agent 40:`; no on-commit CI workflows.
- Repository tools are the GitHub connector via `functions.exec`, and GitHub Actions MCP. Direct container DNS for GitHub is unavailable. Local Node is v22.16.0. Atomic Git tree/commit/CAS ref updates work for multi-file commits.

## Work produced this incarnation
- `src/ast.js::observesDistributedSource` now checks real Node CommonJS loader-source routes: `require.cache`, `require.main`, `module.parent/children/constructor`, `process.mainModule`, internal `process.binding('fs').readFileUtf8`, conservative reflective root access, simple `globalThis.process` aliases and bounded computed property keys, and destructuring of loader capabilities. Without this guard private-field renaming can change observable file bytes. These are correctness restrictions, not secrecy or runtime enforcement.
- `test/module-registry-source-reader.test.js` includes native Node child-process and ESM scanner grids, positive non-observed examples, mutable alias and computed-key probes. Original first ten-case version passed complete CI. Later grids cover native `process.binding` and destructuring and need pinned validation after the latest additions.
- `examples/module-registry-source/before/`, `after/`, `build.cjs` and `test/module-registry-source-sample.test.js` contain the **actual compiler-generated** before/after program and byte-equality builder. A direct unguarded `renameLocalProperties` pass prints `31 false` versus source-native `31 true`, with the protected compiler retaining the source contract. The unrelated private object remains eligible for renaming. The precise sample was checked in via Git CAS tree commit `ea59dc3c8985e63fbbea94cf27e1a35e612a4799`.
- `im-results/commonjs-module-registry-source-observation-2026-11-16.md` is intermediate evidence and mechanism; update it with newer test counts and cross-platform run when done.
- `.github/workflows/manual-cross-readers.yml` now includes the two new focused test files, manually dispatched only.
- Current generated sample path `examples/module-registry-source/README.md` contains reproduction instructions.

## Pinned evidence
- Full original 10-case source guard passed [manual validation 43814630774](https://github.com/FlareZ123/obfs/actions/runs/43814630774) at exact source `0fc93c7757e132c3583e3034fd37c39c69ee252b`: Ubuntu 1415 passed/1 skipped, Windows 1414 passed/2 skipped, 0 failed. Strict JSDoc suites, sampled benchmarks, 15 real Chromium fixtures passed. Root README status was updated to this exact pin.
- [Full run 43816170955](https://github.com/FlareZ123/obfs/actions/runs/43816170955) at `de0b1432be6f1473aaf8ad210490650707c7501a` failed with **unrelated concurrent edits**: Agent 41's Intl function source-coercion regressions and Agent 45's `sno-esm-runtime-hook-attack.js` undefined `hookedOutput`/external JSDoc diagnostic. Both agents were notified in `communications/agent41/` and `communications/agent45/`. Do not call that SHA a green full release.
- [Focused cross-reader gate 43816841075](https://github.com/FlareZ123/obfs/actions/runs/43816841075) passed at `175fad9adfbd46f133e01b7960361b4fe1dc7249` on Ubuntu/Windows.
- [Focused cross-reader and unguarded attack witness 43817107119](https://github.com/FlareZ123/obfs/actions/runs/43817107119) passed at `ea59dc3c8985e63fbbea94cf27e1a35e612a4799`.
- [Focused source reader and destructuring gate 43817499736](https://github.com/FlareZ123/obfs/actions/runs/43817499736) passed at `8fbc12bb7b4a303722c1108bea3c2a7ced02c53a`.
- Most recent expanded destructuring source and test commits after the above gate: `f60dc4c3e5944a755a5e7db9ba03fb9cf8e439ad` (`src/ast.js`) and `8fbc12bb7b4a303722c1108bea3c2a7ced02c53a` (new test suite); this pin already includes those. More changes may require another gate.

## Next research actions
1. Confirm focused cross-platform outcome for latest source, then update the report to include immutable SHA and attack evidence. Check newly introduced browser computed-destructure/Node internal binding tests in failure logs if any.
2. Avoid full validation on moving HEAD until Agent41's Intl and Agent45's runtime hook issues are fixed, then run one coherent pinned full suite. Otherwise report passing targeted evidence separately.
3. Consider additional source extraction via destructured/aliased `Reflect.get`, `Object.getOwnPropertyDescriptor`, and Node internals. Where coverage is unproved, decline rather than transforming.
4. Broadcast the concrete compatibility hazard and the independent attack witness. Add a comparison entry to `results/README.md` only as *intermediate* evidence, not established obfuscation secrecy. General 2.5× performance and resistance remain unproved.
5. At a real-clock checkpoint >=70min, push memory/report/code, confirm remote, delete `agents/agent40/.lease.json` in its own final commit, verify, and exit.

## Limits and lessons
- Any Node runtime owned by the adversary exposes source and permits bypassing local integrity checks, independent of source-observer correctness. SCO source-private designs offer different protections but authorized online relaying remains effective in tested workloads.
- Avoid reading GitHub Actions logs through normal GitHub MCP. Use Actions MCP `get_job_logs` with failed-only job IDs and short tails. Use manual workflows, never per-commit CI.
- The user needs durable, runnable code and honest evidence rather than security claims inferred from obfuscation appearance.
