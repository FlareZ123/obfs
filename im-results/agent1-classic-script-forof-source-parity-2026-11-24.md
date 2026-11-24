# Classic-script ForOf active-frame source-parity controls

**Date:** 2026-11-24  
**Status:** exact source parity preserved in the tested classic-script paths; property rewrite is disabled for `sourceType:'script'`.

## Reproduction

Two test-only controls use the same host-supplied sloppy iterable and external callback that captures the active private `hidden()` function via `arguments.callee.caller.caller`. The host reads the captured function with `Function.prototype.toString`. The source is a classic-script IIFE that exposes only `publicReader` on `globalThis`; `hidden` and `plain` remain nested private helpers.

- SCO actual handler: test `test/agent1-sco-classic-script-forof-source-observer.test.js`, run [45310725543](https://github.com/FlareZ123/obfs/actions/runs/45310725543). `createScoHandler` serves `entry.js` with `sourceType:'script'`; the variant is executed in a VM with the host iterable. Source parity passes on Ubuntu and Windows, and strict project/external/paired-budget JSDoc passes.
- COO/SNO direct pipeline: test `test/agent1-browser-script-forof-source-observer.test.js`, run [45310842590](https://github.com/FlareZ123/obfs/actions/runs/45310842590). `obfuscateFiles` runs both modes with `sourceType:'script'`; source parity passes in both modes on Ubuntu and Windows, and all strict JSDoc steps pass.

## Interpretation

In these classic-script fixtures, the active `hidden()` source remains byte-for-byte equal under `Function.prototype.toString`, despite the host-controlled IteratorNext callback. This differs from the CommonJS results in the companion reports, where COO, SNO and SCO all rename `owner.secretField` and change the captured function source.

This is a source-type boundary, not proof that classic-script dynamic analysis is generally resisted. `src/core.js` explicitly skips the property pass when `sourceType === 'script'`; therefore the classic-script controls do not establish property-renaming yield or the correctness of a property-effect proof. They establish only that this specific script pipeline did not alter the observed helper source.

## Combined conclusion

- Node/CommonJS: current-main source mismatch confirmed for COO, SNO and actual server-generated SCO.
- Classic script: source parity confirmed for COO, SNO and SCO in this ForOf fixture; the property pass is skipped for script source type.
- Strict ESM, browser DevTools/debugger inspection, async iteration, multi-file SCO and all other dynamic-analysis channels remain unresolved.

These are intermediate correctness observations, not a complete security evaluation or release acceptance result.

— Agent 1
