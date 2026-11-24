# Agent 3: native intrinsic callback-dispatch active-frame witnesses

**Date:** 2026-11-24  
**Status:** intermediate Node/V8 runtime evidence; no compiler change, CI dispatch, PR or release claim.  
**Runtime:** Node.js v22.16.0.

## Purpose

The current source-observer contract models unknown host callbacks, Proxy internal methods, iterators, coercion hooks and PromiseResolve. This probe checks another producer family: standard native built-ins that synchronously invoke user-supplied or object-provided callbacks while the calling function remains active.

## Reproduction

```sh
node sims/agent3-native-intrinsic-callback-dispatch.js
```

No third-party dependencies. The script captures both sloppy caller chains (where permitted) and V8 `Error.prepareStackTrace` CallSite name/line/column metadata. It asserts eight synchronous callback cases plus one asynchronous timing control.

- Script SHA-256: `f2a5ec304f158de34e52613a327596fd78cec4fd1095b570a6c68ec989180373`
- Raw second-run output: `im-results/raw-agent3-native-intrinsic-callback-dispatch-node22.json`
- Raw output SHA-256: `644884db54fc690389a073e29cf936cbd5504ab6f21034a37f743f70f0a0a971`

## Results

**9/9 assertions passed** on Node v22.16.0.

| Native operation | Active caller frame in V8 CallSite | Exact hidden source through sloppy caller chain |
| --- | --- | --- |
| `JSON.stringify` `toJSON` method | Yes: name/line/column | No in this tested caller chain |
| `JSON.stringify` replacer | Yes: name/line/column | **Yes** |
| `JSON.parse` reviver | Yes: name/line/column | **Yes** |
| `Array.prototype.sort` comparator | Yes: name/line/column | No |
| `String.prototype.replace` callback | Yes: name/line/column | No |
| `Array.prototype.map` callback | Yes: name/line/column | No |
| `Map.prototype.forEach` callback | Yes: name/line/column | No |
| `Array.from` map function | Yes: name/line/column | No |
| `Promise.prototype.then` deferred handler (control) | No: original caller frame has returned | No |

For the JSON replacer and reviver cases, the callback's sloppy caller chain reaches the active `hiddenJsonReplacer` / `hiddenJsonReviver` function object. The probe calls `Function.prototype.toString` on each caller and asserts that the captured source contains `owner.secretField`. This is exact source observation, not merely a function-name or stack-coordinate observation.

For the other seven synchronous cases, V8 exposes the active hidden frame's function name and source line/column. In these callback frames, `CallSite.getFunction()` was false; do not claim the callable object or exact source was recovered for those cases. The `toJSON` case is distinct from replacer/reviver: its caller chain stops at the method, while the active hidden frame remains visible in V8 stack metadata.

A source-paired coordinate control ran the same function shape in two fresh VM contexts. The only intended difference was shortening a preceding own-property spelling from `longPrivatePropertyName` to `x`; both returned the same value. The observed callback frame column shifted **63 → 41** (22 columns). This is a local V8 FramePosition witness, not a compiler differential.

The deferred Promise handler control intentionally runs after `hiddenPromiseThen` has returned and does not inherit that caller frame. This does not establish that a Promise implementation cannot inspect a callback argument; host-held callable escape remains a separate edge.

## Integration implication

The shared plan needs a distinct `IntrinsicCallbackDispatch` (or equivalently structured event) for a verified native intrinsic that invokes user code. A record should identify the effective intrinsic/method, receiver, callback argument or object-provided method, callback position, synchronous/deferred timing, dispatch provenance and the relevant host contract. It should create:
- an observed-value/host-held-callable edge when the callback or method itself can be inspected;
- an active-frame edge for the caller and visible ancestors while synchronous dispatch runs;
- the independently established effect bit (`FramePosition`, `ExactSource`, or `CallableMetadata`) rather than assuming all callback paths expose the same data.

Do not treat a familiar spelling such as `JSON.stringify`, `Array.prototype.map`, `String.prototype.replace` or `Promise.prototype.then` as proof of native identity. A patched method is an unknown/mutable host dispatch. Conversely, even a verified native builtin can invoke user callbacks and therefore needs a callback-dispatch summary.

## Limitations

- Node/V8 v22.16.0 only; no browser or other engine result.
- No current-main obfuscator differential was run. The manual 63→41 pair demonstrates a coordinate channel, not a compiler regression.
- Exact source was established only for the two JSON replacer/reviver sloppy caller-chain cases.
- The other synchronous cases establish stack name/position only in this harness; `CallSite.getFunction()` was false.
- Promise.then is an asynchronous no-active-frame control; callback argument inspection is not tested here.
- No performance, static-reconstruction, tamper-resistance, domain-lock or 2.5× claim.

This is an intermediate donor for the single Agent 3 source-observation plan. It does not justify a pass-local veto or a new compiler candidate.

— Agent 3
