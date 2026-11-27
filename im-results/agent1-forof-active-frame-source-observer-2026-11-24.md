# Current-main ForOf IteratorNext active-frame source mismatch

**Date:** 2026-11-24  
**Status:** confirmed current-main source-observation failure in COO and SNO on Ubuntu and Windows; test-only branch; no compiler change.

## Reproduction

Test-only branch: `agent1-forof-active-frame-transform-check-20261124`, final test commit `4ed9ecf45692f0b572f04a10cf526f72982fc178`, based on main commit `1985a063327ac04a24db19f1fded1a57813136bd`. The only branch artifact is `test/agent1-forof-active-frame-source-observer.test.js`; no `src/` file was changed.

Focused workflow: [45308385661](https://github.com/FlareZ123/obfs/actions/runs/45308385661), manual-validation.yml, input `focused_test=test/agent1-forof-active-frame-source-observer.test.js`. Both Ubuntu and Windows jobs execute the two cases (COO and SNO) and fail at the source-parity assertion. Workflow Node is v22.23.4. A separate local Node v22.16.0 runtime witness also confirmed the sloppy caller capture.

Production-source pins: current main at report time `f18b67cff8e324f2b5af79dc141da252e3187f43`; `src/properties.js` blob `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`; `src/core.js` blob `8d33996821650de540b87502baff00a9e7ea99c7`. The test branch carries the same production blobs.

The test creates an exported CommonJS `publicReader(iterable)`, which directly calls private `hidden(iterable)` and `plain()`. `hidden` reads a local owner's `secretField` after `for...of`; `plain` reads an unrelated local owner's `unrelatedField`. The host supplies a sloppy iterable whose `next()` calls a sloppy external callback. That callback captures `arguments.callee.caller.caller`, which is the active `hidden` function, and the host reads its exact source using `Function.prototype.toString`.

## Observed differential

| Observation | Native | Emitted COO/SNO |
|---|---|---|
| Return value | `3` | `3` |
| Captured `hidden` source | `...return owner.secretField;` | `...return owner._ped87d9e715;` |
| `metrics.properties` | — | `2` |

The emitted code renames both `owner.secretField` to `_ped87d9e715` and the unrelated `other.unrelatedField` to `_p25123bebdc`. Thus the positive-yield control is genuine: the compiler performs two property rewrites, including one unrelated rewrite, while also changing the source of a callable that the host can observe. Runtime value parity does not detect the leak.

## Static explanation

In `src/properties.js` blob `bda3c609...`, the local property proof rejects a member when that member is itself the left/iteration target of a `ForOfStatement` (and similar pattern-target cases). It does not emit an `IteratorDispatch` / reverse `DynamicFrame` effect merely because an otherwise-private callable body contains a `ForOfStatement` over a caller-controlled iterable. `hidden` has a unique declaration and only a direct-call use from `publicReader`, so the current proof treats it as private and admits the local owner-field rename.

This is the unverified step in Agent 24's report `im-results/agent24-current-main-forof-source-observer-red-2026-11-24.md`, now promoted from static-path review plus runtime possibility to an executed current-main transform/source differential.

## Scope and interpretation

- Confirmed: sloppy CommonJS active-frame capture through synchronous `IteratorNext`, in the current-main COO and SNO property pipelines, on both Ubuntu and Windows.
- Not established: strict active functions, async iterator legacy caller capture, browser DevTools/debugger channels, classic-script pipeline, SCO request-time `createScoHandler`, or general source-byte observation.
- The focused test step is intentionally red because it asserts source parity, so that workflow skipped its subsequent JSDoc steps. A separate passing focused run [45308534635](https://github.com/FlareZ123/obfs/actions/runs/45308534635) on the same branch ran `test/property-sloppy-caller-source-observer.test.js` and passed strict project JSDoc, strict external JSDoc and paired-budget JSDoc on both Ubuntu and Windows. This typechecks the new red fixture as part of the project.
- This is an intermediate correctness result, not an academic result or a production fix. No claim is made that the current-main candidate is otherwise secure or release-ready.

## Required correction

Add an implicit `IteratorDispatch` producer for `ForOfStatement` execution and propagate a reverse `DynamicFrame` effect to the active callable/ancestor whose source is observable. The proof must account for the iterable supplied by the host, the iterator method and `next` dispatch, and the callable's source/semantic closure. It must not only reject a member that is itself the ForOf target. Preserve the `plain()` positive-yield control: a safe effect model should retain unrelated property yield instead of replacing the proof with a file-wide veto.

Agent 3 owns integration. This report supplies a red-first current-main control and does not propose a competing compiler patch or PR.

— Agent 1
