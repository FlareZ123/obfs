# SCO Node/CommonJS ForOf active-frame source mismatch

**Date:** 2026-11-24  
**Status:** confirmed in the actual server-generated SCO response on Ubuntu and Windows; test-only branch; no compiler change.

## Reproduction

Test-only branch: `agent1-forof-active-frame-transform-check-20261124`, test commit `f71c37f48a5c49bcaadc4f8dcc4585b1a2eb9105`. The test uses `createScoHandler` with a single CommonJS entry (`entry.cjs`), serves the generated variant over a local HTTP server, then executes the response with a host-supplied sloppy iterable in a separate VM context. The host callback captures the active private `hidden()` function through `arguments.callee.caller.caller` and reads its source with `Function.prototype.toString`.

Focused workflow: [45310430205](https://github.com/FlareZ123/obfs/actions/runs/45310430205), manual-validation.yml, input `focused_test=test/agent1-sco-forof-active-frame-source-observer.test.js`. Both Ubuntu and Windows fail the source-parity assertion on Node v22.23.4.

## Observed differential

- Native `hidden()` source: `function hidden(iterable){for(const value of iterable){}return owner.secretField;}`
- SCO response `hidden()` source: `function hidden(iterable){for(const value of iterable){}return owner._pc033b9ebeb;}`
- Native and emitted return values: `3`
- The generated response also renames the unrelated positive-control field `other.unrelatedField` to `other._pdd4daaf9de`.

The test therefore confirms that the server-generated SCO CommonJS response can change the source of a private callable that a client/host callback captures during IteratorNext, while preserving ordinary return-value behavior and retaining unrelated property rewrite yield.

## Script-mode boundary

An earlier attempt using `sourceType:'script'` and a classic-script IIFE did not rename the unrelated control field. This is consistent with `src/core.js` explicitly skipping the property pass for `sourceType === 'script'`; it did not establish a safe source-observer proof. The confirmed SCO result is specifically the Node/CommonJS handler path. ESM strict-mode and browser classic-script behavior remain separate.

## Interpretation

This extends the COO/SNO current-main ForOf result: all three modes now have a confirmed Node/CommonJS source-observation mismatch for a host-controlled synchronous iterator. SCO's server-side generation does not, by itself, protect a client that receives and executes the transformed CommonJS response.

The needed effect remains `IteratorDispatch` plus reverse `DynamicFrame` propagation to the active callable, with an exact-source closure that prevents edits to `owner.secretField` while allowing unrelated safe rewrites. This report does not propose a compiler patch.

## Scope and limits

- Confirmed: actual `createScoHandler` response, CommonJS entry, Node v22.23.4, Ubuntu and Windows, sloppy synchronous IteratorNext callback.
- Not established: classic browser script property transforms (the current script path skips them), strict ESM, async iterator source capture, browser DevTools/debugger extraction, or multi-file SCO sharding.
- The test is intermediate correctness evidence, not an academic result, production fix, or release acceptance result. No compiler source changed.

— Agent 1
