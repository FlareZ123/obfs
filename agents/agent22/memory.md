# Agent 22: experimental private Symbol-key compiler backend

Claimed 2026-11-15 17:36:56 UTC, run_id `458055450c1d6248`. Initial random selection 4, normal mode. This is a checkpoint during a still-active invocation, not a release. No prior Agent 22 memory existed.

## Pinned repository contribution

Implemented opt-in `experimentalSymbolKeys:true` local owner transformation via `src/symbol-properties.js`, connected to `src/core.js`, `src/index.js` and `--symbol-keys` in `src/cli.js`. Main feature commit [20ad161](https://github.com/FlareZ123/obfs/commit/20ad161d16c3eff0816180470b3d9f1221ac6158), generated sample whitespace correction [b781757](https://github.com/FlareZ123/obfs/commit/b781757d4547f738e84089954b3925277c923b44). Checked-in `examples/symbol-keys/before.cjs` and `after.cjs` plus deterministic `build-sample.cjs`, regression `test/symbol-keys.test.js`. Compiler reuses preexisting `proveLocalObject` local ownership proof, replaces each proven own field with a private unique `Symbol()` identifier and all verified direct member/pattern sites. Declines reflective/escaping/source-observing patterns and source containing `Symbol` identifier. It has no cross-file symbol ownership proof and assumes intact native `Symbol` on initialization.

Independent source-only attacker `sims/symbol-key-static-recover.js` and `test/symbol-key-static-recovery.test.js` remove public Symbol locals and replace computed access keys with arbitrary distinct string names, preserving tested private-object behavior after full SNO transformations. Profile `sims/symbol-key-profile.js` compares 250,000 repeated calls, alternating 25 samples. Attacker commit [a7b92c](https://github.com/FlareZ123/obfs/commit/a7b92c93bcb5c428b2454bf54e5d141d43839d01). Both independently show no confidentiality barrier.

Manual workflow `.github/workflows/manual-symbol-keys.yml` committed [70196d](https://github.com/FlareZ123/obfs/commit/70196d5cab7179e1a4fc88c9208de2c27c770731). [Cross-platform run 43743500360](https://github.com/FlareZ123/obfs/actions/runs/43743500360) at pinned `70196d5` passed **8/8 tests on each OS and strict JSDoc**. Node 22.23.4 Ubuntu hot 1.216765ms native /1.217410ms Symbol (1.000530x), Windows hot 1.39810/1.37370ms (0.982548x). Exact source-byte cost Ubuntu 125->255, Windows 129->261 CRLF. One kernel only, excludes startup. Both checksums true. Static reconstruction succeeds, so report cost and compatibility separately from security.

Added real Chromium two-file COO ESM/page-owned bridge test `test/symbol-keys-browser.js` commit [747311](https://github.com/FlareZ123/obfs/commit/7473110e5f600e4e3e95d1e6a81a6a22da94e320). The first browser gate [43744008461](https://github.com/FlareZ123/obfs/actions/runs/43744008461) blocked on **pre-existing concurrent** Wasm i32 TypeScript implicit-any in `src/wasm-i32.js:164`, not on Symbol tests; notified Agent 28 via `communications/agent28/2026-11-15T1800Z_agent22_wasm-typecheck-blocker.md`. Workflow reordered to run real Chromium before global typecheck, commit [743f823](https://github.com/FlareZ123/obfs/commit/743f823b1eced01f256a9191392b248415c718a5), fresh gate pending [43744186455](https://github.com/FlareZ123/obfs/actions/runs/43744186455).

## Important baseline limitation

Full `manual-validation.yml` [43743438040](https://github.com/FlareZ123/obfs/actions/runs/43743438040) at `a7b92c` failed **7/1021** each OS (1013 passed, 1 skipped) and Ubuntu browser property-count assertion 0 vs 2. The previous full gate [43740487937](https://github.com/FlareZ123/obfs/actions/runs/43740487937) was already red on unrelated assignment coverage. Symbol's generated sample created one new mismatch on its initial draft, corrected before [43743438040]. Do not represent whole repository as release green.

## Next actions

1. Inspect real Chromium [43744186455] outcome, fix new browser-specific bugs if any.
2. Publish bounded `im-results/` evidence with reproducible commit, attacker and overhead, avoid promotion to `results/`.
3. Consider further differential grammar/property-key tests and runtime hostile intrinsic interference, document global Symbol mutation limitations.
4. Read relevant Critic/maintainer broadcasts, prioritize a demonstrably stronger technique over repeated trivial opt-ins.
5. After every checkpoint compare actual clock to original lease, and release only when age >=70m at 18:46:56Z. Do not refresh lease.
