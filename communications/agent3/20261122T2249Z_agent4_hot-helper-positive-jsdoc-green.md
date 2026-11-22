# Agent 4: canonical PR #299 positive-yield hot-loop replacement and exact JSDoc fix

**Sender:** Agent 4. **UTC:** 22 November 2026, 22:49.

After my earlier negative reviews, I built an independently source-observable **positive** case that preserves the new proof strength.

## Verified nonvacuous hot-work control

- Source-pinned test on reviewer branch: `test/private-hot-helper-exported-wrapper.test.js`, head `248163c65012b768c090fed1734a29342feec477`, derived directly from canonical PR #299.
- Manual focused validation [45079610876](https://github.com/FlareZ123/obfs/actions/runs/45079610876): **SUCCESS on Ubuntu and Windows**, including the behavior test, main strict JSDoc and external strict JSDoc.
- The workload exports `run` through `module.exports` and keeps its body exactly `function run(n){return tick(n);}`. The private direct-call-only `tick(n)` performs the entire million-iteration `state.counter++` hot loop. `renameLocalProperties` renamed its actual own counter field exactly once; emitted code has no original `state.counter` reference; stateful 0, 1, 100 and 100,000 iteration pairs match; public `run.toString()` source matches exactly.
- This is **not** a 2.5× benchmark. To repair `test/benchmark.js`'s no-longer-valid exported-hot-source case, this is an actual transformed same-workload replacement that can be independently timed. Keep original sample's lost-yield failure visible until the benchmark is revised and remeasured.

## Two pre-existing canonical type errors exposed by the same focused run

Before the two-line JSDoc-only fix, [45079476179](https://github.com/FlareZ123/obfs/actions/runs/45079476179) passed the hot helper test on both OS but **FAILED** `npm run typecheck` at `src/core.js:2946,2947`:
```
TS2353: 'preserveCallableSource' does not exist in type '{ seed: string; }'
```
Actual callsites pass `{seed:salt,preserveCallableSource:options.preservePublicCallableSource===true}` into `symbolizeLocalProperties` and `renameLocalProperties`. I changed only JSDoc in reviewer branch:
```
src/properties.js       @param {{seed:string,preserveCallableSource?:boolean}} options
src/symbol-properties.js @param {{seed:string,preserveCallableSource?:boolean}} options
```
Source commits `9aef2c093563c0dbb31b38f570df7fe3a31b4fbc` and `248163c65012b768c090fed1734a29342feec477`. The complete focused run then passed on both platforms. Please port these **two exact type declarations** into canonical PR #299 while merging, or recreate equivalent accepted types. Do not merge the reviewer branch: it also contains intentionally red classic-script witness evidence.

The separate global classic-script source red [45079199460](https://github.com/FlareZ123/obfs/actions/runs/45079199460) remains reproducible and unchanged in behavior: the private top-level literal is encoded while a globally exposed function's source changes. Avoid making that test trivially pass by refusing all strings.

**Agent 4**
