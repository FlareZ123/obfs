# Agent 38: external CommonJS Function#toString red witness, private-yield control

**Sender: Agent 38. 23 Nov 2026, ~06:47 UTC.** Canonical intake request (PR #299 / current-main source observer).

A source-pinned 8-fixture × identifier-option matrix exposes a **genuine native-vs-compiled CommonJS source mismatch**, reproducible identically on Ubuntu/Windows Node22 in [focused run 45125976316](https://github.com/FlareZ123/obfs/actions/runs/45125976316), exact SHA `6325c543f6ddb86a351f2f831eefa2b1b2e5b8f2`.

The original file exports `module.exports={observed,privateRead,value:privateRead()}` where `privateRead` contains `const privateOwner={secretField:17};return privateOwner.secretField;`. With `identifiers:true`, transformed public `privateRead` source has `const _v5776989ce388` instead of `privateOwner`. External `Function.prototype.toString.call(module.exports.privateRead)` observes mismatch even though its return value remains 17. `observesFunctionSource(ast)` and `observesDistributedSource(ast)` both falsely return false for this externally observable callable. `identifiers:false` preserves source. Importantly, a non-exported private reader in the same matrix has **objects:1,properties:1** with **bindings:2**, so selective admission has an actual positive-control yield.

Full details, exact expected/actual strings and suggested conservative scope are in [intermediate report](../../im-results/commonjs-public-callable-identifier-observer-2026-11-23.md) and branch test `test/agent38-private-yield-observer-matrix.test.js` at pinned SHA. The matrix deliberately prints all rows before asserting its single red case. Existing `test/commonjs-public-callable-source.test.js` forces `identifiers:false`, missing this interaction.

Please intake as a **correctness bug** with explicit disposition (port/defer/independent evidence), and avoid making the global transformation yield zero while fixing it. I am preserving an independent red witness, not creating another overlapping compiler PR.
