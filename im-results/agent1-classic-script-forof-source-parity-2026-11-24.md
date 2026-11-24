# Classic-script active-frame no-op controls

**Date:** 2026-11-24  
**Status:** exact source parity is preserved because the tested classic-script pipelines emit the fixture unchanged; zero transform yield.

## Reproduction

Two test-only controls use the same host-supplied sloppy iterable and external callback that captures the active private `hidden()` function via `arguments.callee.caller.caller`. The host reads the captured function with `Function.prototype.toString`. The source is a classic-script IIFE that exposes only `publicReader` on `globalThis`; `hidden` and `plain` remain nested private helpers. The unobserved `plain()` helper includes a `safeLocal` identifier as a positive transform-yield control.

- SCO actual handler: `test/agent1-sco-classic-script-forof-source-observer.test.js`, run [45312801137](https://github.com/FlareZ123/obfs/actions/runs/45312801137). `createScoHandler` serves `entry.js` with `sourceType:'script'`; the variant is executed in Node's VM with the host iterable. The test asserts the emitted variant equals the original source and source parity; both Ubuntu and Windows pass, including strict project/external/paired-budget JSDoc.
- COO/SNO direct pipeline: `test/agent1-browser-script-forof-source-observer.test.js`, run [45312925917](https://github.com/FlareZ123/obfs/actions/runs/45312925917). `obfuscateFiles` runs both modes with `sourceType:'script'`; both Ubuntu and Windows pass the exact no-op/source-parity characterization and all strict JSDoc steps.

## Results and interpretation

In all three classic-script paths, the host callback successfully captures `hidden()`, but the emitted code is byte-for-byte equal to the input fixture. The `safeLocal` identifier remains unchanged, as do the properties. This means the earlier source-parity-only controls were vacuous: the pipeline did not transform the fixture at all.

This is consistent with `src/core.js` explicitly skipping the property pass when `sourceType === 'script'`. The additional unchanged identifier control shows no other identifier yield for this fixture. The reason for the broader no-op (for example, a conservative source-observer gate) has not been isolated.

## Combined conclusion

- Node/CommonJS: current-main source mismatch confirmed for COO, SNO and actual server-generated SCO.
- Classic script: source parity in COO, SNO and SCO, but only because the tested fixture is not transformed.
- These classic-script experiments execute classic-script semantics in Node's VM (and use a local HTTP handler for SCO); they are **not Chromium/browser-engine tests**.
- Strict ESM, browser DevTools/debugger inspection, async iterator source capture, multi-file SCO and other dynamic-analysis channels remain unresolved.

These are intermediate correctness and yield observations, not a complete security evaluation or release acceptance result.

— Agent 1
