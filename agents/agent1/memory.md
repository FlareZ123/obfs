# Agent 1 continuity notes (2026-11-15)

Claimed `2026-11-15T03:35:53Z` with run ID `c9e42d9ff73a0b03`. Initial draw selected normal mode. Lease file `agents/agent1/.lease.json` must remain unchanged until the measured 70-minute release time (`04:45:53Z`), after all persistent work is pushed; then delete lease as the final operation. Root README explicitly prohibits per-commit CI.

## Research and implementation

I implemented an independent TypeScript-backed conservative own-property renamer in `lib/transform.js`, mode helpers in `lib/build.js`, authenticated SCO builder in `lib/sco-server.js`, and initial `bin/` scripts. Agent 7 concurrently committed the Acorn-based main CLI `src/` and replaced the `bin/` and `package.json`; I preserved its CLI. The package now includes Acorn and TypeScript, Node typings, and `jsconfig.json` for strict checkJs in `lib/`. Main CLI is `src/`; `lib/` is a comparator. Agent 2 and Agent 3 are contributing to Acorn safety and ESM quotes. I sent coordination messages to Agent 7 and Agent 2.

Strict JSDoc typecheck of local `lib/` passed with TypeScript 5.8.3 on Node v22.16.0. Last local `npm test` for my prototype: **34 passed, one optional Chromium test skipped**. Headless Chromium failed to start locally and Playwright connector reported unavailable. Agent 2 previously ran manual workflow-dispatch CI for the shared Acorn baseline (run `43675651844`), which passed before later changes.

My adversarial observations and fixes are documented in `im-results/comparative-baselines-2026-11-15.md` and supported by `test/transform.test.js`. Specifically:
1. Missing implicit `arguments[0]`, rest-param, async/generator alias handling.
2. Missing indirect namespace/dynamic import/require lookup of exported objects, especially computed `ns["a"]`.
3. Helper-return escape through implicit arrow `()=>identity(a)`, detected by `sims/fuzz.js`.
4. Later function-valued property write `a.secret=function(){return Object.keys(this)[0]}`, which leaks key names.
5. Indirect dynamic `eval`/`Function` through computed `globalThis[k]` or simple aliases. This class is only conservatively partially handled; arbitrary runtime dynamic code and source introspection remain unproved.

`sims/reconstruct.js` and `test/attack.test.js` show static normalization of hashed property names; current static resistance is weak. `sims/fuzz.js`: deterministic 33-case corpus with seed `0xC0FFEE`, 28 property renames and no behavior differences after fixes. `sims/benchmark.js` verifies each workload does actual obfuscation, then compares Node hot-loop medians (4 cases: 0.973x, 0.980x, 1.023x, 1.654x, all <= 2.5x). Raw data in `im-results/baseline-performance.json`.

## Why this is still intermediate

The demanded maximum tamper resistance and execution locking cannot be established for COO and SNO under their full-control attacker models. SCO may keep secrets server-side, but issued client JS remains extractable. No rigorous browser matrix, cross-runtime mutation fuzz coverage, attacker-grade instrumentation/LLM attack studies, general object property flow, source introspection support, or provably universal 2.5x bound exists. `results/` should only contain established, independently reproducible academically substantive results.

## Next actions

- Compare `src/` and `lib/` using identical differential fuzz cases, including quoted ESM export names and reflective receiver behavior.
- Identify further unsoundness where closure, prototype, dynamic code, or `Function#toString` observes rewritten property names; prefer conservative block to silent miscompile.
- Extend executable browser tests in GitHub Actions manual workflow_dispatch, never per-commit.
- Benchmark startup cost of string decoding in COO, high-volume property hot paths, and simple workloads.
- Keep intermediate evaluation fresh; ensure tests run on a clean shared checkout and monitor Agent 2/7 changes before touching overlapping files.
