# SCO cross-file host-held callback source spelling red control

**Date:** 2026-11-24  
**Status:** Reproduced on Ubuntu and Windows; current-main behavior witness, not a desired-behavior regression gate  
**Owner:** Agent 24

## Question

Does the real SCO HTTP handler's request-time literal spelling variation mutate a helper-defined callback's observable source when the callback is returned across a module boundary and handed to a host-controlled callback sink that reads `Function.prototype.toString` but never invokes it?

## Fixture

The source group has two CommonJS files:

```js
// helper.cjs
function createHidden(){
  return function hidden(){
    globalThis.result='helperCallbackSourceLiteral';
    return globalThis.result;
  };
}
module.exports={createHidden};

// entry.cjs
const {createHidden}=require('./helper.cjs');
const hidden=createHidden();
queueMicrotask(hidden);
console.log(hidden());
```

The test starts an HTTP server with the actual `createScoHandler(files,{closedWorld:true})`, fetches both `/obfs/helper.cjs` and `/obfs/entry.cjs` as the client would, writes the delivered source group to a temporary directory, then executes it under a Node preload. The preload replaces `queueMicrotask`, reads `Function.prototype.toString.call(callback)`, writes the observed source, and records `invoked:false`. It never invokes or schedules the callback. The application itself calls `hidden()` and prints its value, independently checking runtime parity.

The string literal is deliberately an assignment RHS inside the callback because `varyLiteralSpellings` targets assignment/variable initializer literals.

## Result

**Status: Current-main source mismatch reproduced.**

- Native callback source: `function hidden(){globalThis.result='helperCallbackSourceLiteral';return globalThis.result;}`
- Delivered callback source: `function hidden(){globalThis.result="<escaped spelling of helperCallbackSourceLiteral>";return globalThis.result;}`
- Native stdout: `helperCallbackSourceLiteral`
- Delivered stdout: `helperCallbackSourceLiteral`
- Host callback invoked: `false`

The emitted helper source retains the same function and identifier names; the observable difference is the request-time literal spelling. This isolates the `varyLiteralSpellings` stage rather than a later identifier/property pass.

## Why the current guard misses it

`createScoHandler` computes the existing `interfileSourceObserver` boolean over the full source group. When that heuristic is true, the request path skips `varyLiteralSpellings` and serves the confirmed source unchanged. In this fixture the observer is a host preload, not a source-level `Function#toString` call; the input code only passes the callback to `queueMicrotask`. The current static heuristic does not recognize this host-held callable escape, so `interfileSourceObserver` remains false and request-time spelling variation runs on the helper module.

This is a current-main red control for the request-time mutation path. It does not imply the existing conditional is absent: the conditional is present, but its static boolean does not model this host-held callback effect.

## Reproduction

- Test-only branch: `agent24-sno-cli-host-held-string-20261124`
- Current branch head: `2104c14cfdf72a3d0bb9994052ee680d1cec04f8`
- Test: `test/agent24-sco-crossfile-host-held-spelling.test.js` (two cases: one response mutation and concurrent independent helper variants)
- Stronger workflow: [Manual validation run 45337315146](https://github.com/FlareZ123/obfs/actions/runs/45337315146), run #3275
- Earlier single-response run: [45336634434](https://github.com/FlareZ123/obfs/actions/runs/45336634434), run #3273
- Node: 22.23.4
- Ubuntu: both focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3275
- Windows: both focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3275

The handler also creates a fresh 24-byte nonce for each module GET (`src/sco.js` around line 672), varies only that response's `confirmedFile`, and calls `obfuscateFiles([input])`. A browser may fetch entry and helper concurrently, so request-variant generation is per file response. A future full-graph plan must therefore be a unique immutable response plan for each GET, with one changed SourceUnitRef and all other module edges retained. This test does not yet exercise concurrent GET isolation.


## Concurrent response variant control

The second test fetches `entry.cjs` once and `helper.cjs` twice **concurrently** from one handler instance. The two helper responses have different request-specific escaped spellings. Each helper variant is then executed with the same entry response under the host preload:

- both callback sources differ from native and from each other;
- both stdout values equal native `helperCallbackSourceLiteral`;
- neither host callback is invoked.

This confirms that the current handler produces independent source variants per module GET. It does **not** prove a future plan is isolated correctly; the plan is not implemented. It establishes the acceptance requirement that each response have its own immutable plan/generation while preserving cross-file effect closure.

## Required future behavior and limits

The request-specific full-graph `SourceObservationPlan` must govern `varyLiteralSpellings` as well as later `obfuscateFiles` consumers. For this fixture, a future green acceptance test should preserve the helper callback's exact source while continuing to vary unrelated, unobserved literals in the request variant. The plan must be request-generation-specific and isolated across concurrent SCO requests.

This is a two-file CommonJS handler/Node-host witness. It does not establish general multi-file SCO parity, browser-engine behavior, concurrency isolation, all callback sinks, full CLI/package acceptance, or performance budget. No production source was changed; the test remains on its isolated branch.
