# SNO CLI host-held callable string-source red control

**Date:** 2026-11-24  
**Status:** Reproduced on both CI platforms; current-main behavior witness, not a desired-behavior regression gate  
**Owner:** Agent 24

## Question

Does the production SNO CLI's default string-literal encoding alter a function's observable source when that function is handed to a host callback sink that reads `Function.prototype.toString` but does not invoke the callback?

## Fixture and observation

The one-file CommonJS entry is:

```js
function hidden(){return 'callbackSourceLiteral';}
queueMicrotask(hidden);
console.log(hidden());
```

A Node preload replaces `queueMicrotask` with a host-controlled sink. The sink reads `Function.prototype.toString.call(callback)`, writes the source to a temporary observation file, and records `invoked:false`. It never invokes or schedules the callback. The program itself calls `hidden()` and prints its result, so the native/emitted runtime value is checked independently of the host source observation.

The first fixture draft used `'callbackSourceLiteral:'+inputValue`. That did **not** isolate this issue: the existing `observesFunctionSource` analysis correctly treats a string-concatenation expression with an unknown operand as a possible implicit function-to-source coercion, so the literal remained unchanged. Replacing the body with a direct string-literal return removed that independent source-observation path.

## Result

<badge color="danger">Current-main source mismatch reproduced</badge>

- Native source: `function hidden(){return 'callbackSourceLiteral';}`
- SNO CLI emitted source: `function hidden(){return _o8fc09789ad42[0];}`
- Native stdout: `callbackSourceLiteral`
- Emitted stdout: `callbackSourceLiteral`
- Host callback invoked: `false`

The value behavior is preserved, but the source spelling is not. This isolates the SNO CLI string-encoding pass: the SNO CLI supplies no explicit `strings` option, and the current core defaults string encoding on for SNO. The host-held callback is not recognized as a source-observation dependency by the string pass, so its literal is rewritten even though the host reads the function source.

## Reproduction

- Test-only branch: `agent24-sno-cli-host-held-string-20261124`
- Branch head: `4dcce4596594f3b6c5e3e94bb9b3ef09096479d6`
- Test: `test/agent24-sno-cli-host-held-string-source.test.js`
- Workflow: [Manual validation run 45333127689](https://github.com/FlareZ123/obfs/actions/runs/45333127689), run #3263
- Node: 22.23.4
- Ubuntu: focused test, project JSDoc, external JSDoc, paired-budget JSDoc all passed
- Windows: focused test, project JSDoc, external JSDoc, paired-budget JSDoc all passed

The initial draft failed because its `+` expression independently exposed a potential coercion path; the corrected pure-return fixture passed on both platforms. The earlier missing separator in `jsconfig.external.json` was repaired on main in `ca9763751270a6b1e43a704f3f5bfdba9aa5c4a8`; the successful external JSDoc steps validate the repaired config.

## Interpretation and limits

This is a **red-control witness** for current behavior, not an acceptance test for the desired obfuscator. When the shared `SourceObservationPlan` / host-held callable closure is implemented, invert the source-mismatch assertion to require exact source parity, while retaining this baseline as evidence. Do not merge this test as a green regression gate before the fix; it intentionally passes only while the current leak exists.

Scope is one-file SNO CLI, Node 22.23.4 on Linux and Windows. It does not establish multi-file SNO parity, package/CLI acceptance, browser behavior, SCO behavior, CallableMetadata coverage, performance budget, or a release candidate. No production source was changed, and the test remains on its isolated branch.

