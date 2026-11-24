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

## Additional SCO PromiseResolve result

A second test, `test/agent1-sco-promise-resolve-source-observer.test.js`, uses the actual `createScoHandler` CommonJS response and a host-controlled sloppy thenable getter during `await`. The host captures the active async `hidden()` through V8 `Error.prepareStackTrace` / `CallSite.getFunction` and reads its source.

Focused run [45313400478](https://github.com/FlareZ123/obfs/actions/runs/45313400478) fails exact-source parity on both Ubuntu and Windows (Node v22.23.4). Native source contains `owner.secretField`; emitted source contains `owner._pd323527a84`. The unrelated field is also renamed to `other._pdf573ed7a0`; both executions return 3. The positive-yield assertion executes before the source-parity red, so the mismatch is not a zero-yield artifact.

This confirms SCO Node/CommonJS false-safe behavior for both synchronous IteratorNext and asynchronous PromiseResolve thenable assimilation. The red run skips JSDoc by design; the added test file passed strict project/external/paired-budget JSDoc on both OS in [run 45313505327](https://github.com/FlareZ123/obfs/actions/runs/45313505327).

## Additional SCO ToPrimitive result

A third test, `test/agent1-sco-toprimitive-source-observer.test.js`, exercises arithmetic coercion through a host-supplied `Symbol.toPrimitive` method in the actual SCO CommonJS handler response.

Focused red run [45313693556](https://github.com/FlareZ123/obfs/actions/runs/45313693556) fails source parity on Ubuntu and Windows (Node v22.23.4). Native `hidden()` source contains `const sum=value+1;return owner.secretField+sum;`; the SCO response contains `const _v7d383b55720a=value+1;return owner._pf23c025db0+_v7d383b55720a;`. The unrelated `plain()` field is also renamed to `other._p4dbe751f86`; both executions return 5. The positive-yield assertion runs before the source-parity red.

The new test file passed strict project/external/paired-budget JSDoc on both OS in [run 45313771390](https://github.com/FlareZ123/obfs/actions/runs/45313771390).

SCO Node/CommonJS therefore now has three independently reproduced implicit-dispatch source mismatches: synchronous IteratorNext, arithmetic ToPrimitive, and asynchronous PromiseResolve thenable assimilation.

## Script-mode boundary

Follow-up classic-script controls are recorded in `im-results/agent1-classic-script-forof-source-parity-2026-11-24.md`. The actual SCO handler emits the classic-script fixture byte-for-byte unchanged on Ubuntu and Windows (run `45312801137`); the unobserved `safeLocal` identifier is also unchanged. This is consistent with `src/core.js` skipping the property pass for `sourceType === 'script'`, but the test also shows zero identifier yield for this fixture. It is therefore a no-op, not evidence that the property proof safely handles IteratorNext while still producing obfuscation yield. The classic-script execution used Node VM, not Chromium. The confirmed SCO mismatch is specifically the Node/CommonJS handler path. Strict ESM and browser DevTools/debugger behavior remain separate.

## Interpretation

This extends the COO/SNO current-main ForOf result: all three modes now have a confirmed Node/CommonJS source-observation mismatch for a host-controlled synchronous iterator. SCO's server-side generation does not, by itself, protect a client that receives and executes the transformed CommonJS response.

The needed effect remains `IteratorDispatch` plus reverse `DynamicFrame` propagation to the active callable, with an exact-source closure that prevents edits to `owner.secretField` while allowing unrelated safe rewrites. This report does not propose a compiler patch.

## Scope and limits

- Confirmed: actual `createScoHandler` response, CommonJS entry, Node v22.23.4, Ubuntu and Windows, sloppy synchronous IteratorNext callback.
- Not established: classic browser script property transforms (the current script path skips them), strict ESM, async iterator source capture, browser DevTools/debugger extraction, or multi-file SCO sharding.
- The test is intermediate correctness evidence, not an academic result, production fix, or release acceptance result. No compiler source changed.

— Agent 1
