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
- Current branch head: `15ed09df036f22f8e7791fa8d07e57ad8a542030`
- Test: `test/agent24-sco-crossfile-host-held-spelling.test.js` (three cases: host-preload mutation, concurrent variants, explicit in-source observer control)
- Strongest workflow: [Manual validation run 45337691731](https://github.com/FlareZ123/obfs/actions/runs/45337691731), run #3276
- Earlier concurrent-variant run: [45337315146](https://github.com/FlareZ123/obfs/actions/runs/45337315146), run #3275
- Node: 22.23.4
- Ubuntu: all three focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3276
- Windows: all three focused tests, project JSDoc, external JSDoc, paired-budget JSDoc all passed in run #3276

The handler also creates a fresh 24-byte nonce for each module GET (`src/sco.js` around line 672), varies only that response's `confirmedFile`, and calls `obfuscateFiles([input])`. A browser may fetch entry and helper concurrently, so request-variant generation is per file response. A future full-graph plan must therefore be a unique immutable response plan for each GET, with one changed SourceUnitRef and all other module edges retained. The concurrent test now exercises independent helper GET variants, but it does not test isolation of a future immutable response-plan object (no plan is implemented yet).


## Concurrent response variant control

The second test fetches `entry.cjs` once and `helper.cjs` twice **concurrently** from one handler instance. The two helper responses have different request-specific escaped spellings. Each helper variant is then executed with the same entry response under the host preload:

- both callback sources differ from native and from each other;
- both stdout values equal native `helperCallbackSourceLiteral`;
- neither host callback is invoked.

This confirms that the current handler produces independent source variants per module GET. It does **not** prove a future plan is isolated correctly; the plan is not implemented. It establishes the acceptance requirement that each response have its own immutable plan/generation while preserving cross-file effect closure.


## Explicit source-observer / zero-yield control

A third test adds a source-level observer in `entry.cjs` after the helper factory returns the callback:

```js
const source=Function.prototype.toString.call(hidden);
queueMicrotask(hidden);
console.log(hidden());
```

This is recognized by the current full-group `interfileSourceObserver` heuristic. The handler serves the confirmed source unchanged; the host-observed callback source matches native exactly. The helper's unrelated `'helperUnrelatedLiteral'` also remains unchanged, proving the current group-wide veto withholds unrelated variation.

Together, the three cases show both failure modes in the same SCO handler:
- **Observer only in host preload:** heuristic misses the host-held callback; request-time spelling mutates callback source.
- **Observer explicit in source:** heuristic recognizes it; callback source is preserved, but unrelated helper literal variation is also withheld group-wide.
- **Concurrent helper GETs:** each response receives an independent spelling variant and independently mutates the observed callback source.

The future plan must retain the exact callback closure while allowing unrelated literals to vary in all three cases.

## Relation to other SCO source-observation evidence

This is a distinct source-mutating stage from Agent 1's SCO property-pass witnesses. `im-results/agent1-sco-forof-active-frame-source-observer-2026-11-24.md` documents actual `createScoHandler` responses changing host-observed callable source through property renaming during IteratorNext, PromiseResolve and ToPrimitive. This report documents request-time `varyLiteralSpellings` changing the same kind of observable source before the later `obfuscateFiles` passes. Together, these show why the shared plan must govern every source-mutating stage, including request-time variation, not only property/identifier/string transforms inside `obfuscateFiles`.

## Required future behavior and limits

The request-specific full-graph `SourceObservationPlan` must govern `varyLiteralSpellings` as well as later `obfuscateFiles` consumers. Future green acceptance should require: (1) an unknown host callback escape is classified as `HostHeldCallable` even when the host's `Function#toString` read exists only in a preload; (2) an explicit `Function#toString` observer in entry propagates through the cross-file factory return to the helper callable's exact source closure; (3) unrelated helper/entry literals outside that closure remain eligible for request-time variation; and (4) each concurrent module GET receives an immutable full-graph response plan with its own requestVariantGeneration.

This is a two-file CommonJS handler/Node-host witness. It does not establish general multi-file SCO parity, browser-engine behavior, future response-plan isolation across concurrent requests, all callback sinks, full CLI/package acceptance, or performance budget. No production source was changed; the test remains on its isolated branch.
