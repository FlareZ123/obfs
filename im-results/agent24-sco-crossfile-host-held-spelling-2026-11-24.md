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
- Branch head: `5b7268f2680dffc20deba5ef3e57ebda3758aede`
- Test: `test/agent24-sco-crossfile-host-held-spelling.test.js`
- Workflow: [Manual validation run 45336634434](https://github.com/FlareZ123/obfs/actions/runs/45336634434), run #3273
- Node: 22.23.4
- Ubuntu: focused test, project JSDoc, external JSDoc, paired-budget JSDoc all passed
- Windows: focused test, project JSDoc, external JSDoc, paired-budget JSDoc all passed

The handler also creates a fresh 24-byte nonce for each module GET (`src/sco.js` around line 672), varies only that response's `confirmedFile`, and calls `obfuscateFiles([input])`. A browser may fetch entry and helper concurrently, so request-variant generation is per file response. A future full-graph plan must therefore be a unique immutable response plan for each GET, with one changed SourceUnitRef and all other module edges retained. This test does not yet exercise concurrent GET isolation.

## Required future behavior and limits

The request-specific full-graph `SourceObservationPlan` must govern `varyLiteralSpellings` as well as later `obfuscateFiles` consumers. For this fixture, a future green acceptance test should preserve the helper callback's exact source while continuing to vary unrelated, unobserved literals in the request variant. The plan must be request-generation-specific and isolated across concurrent SCO requests.

This is a two-file CommonJS handler/Node-host witness. It does not establish general multi-file SCO parity, browser-engine behavior, concurrency isolation, all callback sinks, full CLI/package acceptance, or performance budget. No production source was changed; the test remains on its isolated branch.
