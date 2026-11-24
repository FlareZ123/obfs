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



## Current-main COO/SNO compiler differential

A focused diagnostic test-only run now checks these callback paths through the actual current-main `obfuscateFiles` property pipeline. Test file: `test/agent3-native-intrinsic-callback-dispatch-transform.test.js`; branch commit: `be3351d7d94d5079ecb87131b1bbefa495af18d0`. The production inputs are unchanged source blobs:
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `src/properties.js`: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`
- `src/core.js`: `8d33996821650de540b87502baff00a9e7ea99c7`

Focused manual-validation run [45315861729](https://github.com/FlareZ123/obfs/actions/runs/45315861729) completed successfully on Ubuntu and Windows (Node 22.23.4). All **16 diagnostic controls** passed (8 callback operations × COO/SNO). Each control requires positive property rewrite yield, renaming of the unrelated `plain()` field, unchanged returned value, and a changed observation:
- JSON replacer/reviver: exact `hidden()` source differs after owner-key rewriting;
- JSON `toJSON`, Array sort, String replace, Array map, Map forEach and Array.from mapFn: the observed active `hidden()` frame column differs after the preceding owner-key rewrite.

Both OS also passed strict project JSDoc, strict external JSDoc and the paired/complete-suite runtime-budget evaluator JSDoc. This is current-main Node/CommonJS COO/SNO evidence for these eight callback paths; it is not a browser or SCO result, and it is not a full suite or performance-budget acceptance run. The test asserts the diagnostic mismatch on purpose; it is a red-first regression candidate, not a release test that should remain green after a fix.



## Actual SCO handler differential

A second focused test-only fixture uses the real `createScoHandler` HTTP response and then executes that response in a VM with a host-supplied observer callback. Test: `test/agent3-sco-native-intrinsic-callback-dispatch.test.js`. It uses a statically known primitive JSON input so the separate JSON.parse input-coercion guard does not create an unrelated unknown-value refusal.

Focused manual-validation run [45317205047](https://github.com/FlareZ123/obfs/actions/runs/45317205047) completed successfully on Ubuntu and Windows (Node 22.23.4); all 8 classification controls passed. Every case requires:
- actual HTTP-generated SCO response;
- owner property and unrelated `plain()` positive-control property both rewritten;
- native and emitted return values equal;
- a source/position classification against the callback observer.

| SCO operation | Result in this fixture | Evidence |
| --- | --- | --- |
| JSON.stringify replacer | **Exact-source mismatch** | captured `hidden()` source loses `owner.longPrivatePropertyName` |
| JSON.parse reviver | **Exact-source mismatch** | captured `hidden()` source loses `owner.longPrivatePropertyName` |
| Array.sort comparator | **FramePosition mismatch** | active frame column changes |
| Array.map callback | **FramePosition mismatch** | active frame column changes |
| Array.from mapFn | **FramePosition mismatch** | active frame column changes |
| JSON.stringify `toJSON` | Frame column stable | no mismatch in the measured coordinate |
| String.replace callback | Frame column stable | no mismatch in the measured coordinate |
| Map.forEach callback | Frame column stable | no mismatch in the measured coordinate |

The three stable controls still undergo both owner and unrelated property rewrites and preserve values. They establish only that the measured active-frame column did not change in these particular variants; they do **not** prove exact-source, function-name, other-coordinate, or cross-engine safety. The initial broad hypothesis that every callback path would produce a frame mismatch was falsified; the final classification is deliberately per-operation.

The SCO fixture is CommonJS and uses the actual handler response. It is not browser evidence. Combined with the COO/SNO differential above, this gives current-main Node/CommonJS evidence in all three modes for the five failing callback paths; no claim is made that all eight paths fail in every mode.

## Integration implication

The shared plan needs a distinct `IntrinsicCallbackDispatch` (or equivalently structured event) for a verified native intrinsic that invokes user code. A record should identify the effective intrinsic/method, receiver, callback argument or object-provided method, callback position, synchronous/deferred timing, dispatch provenance and the relevant host contract. It should create:
- an observed-value/host-held-callable edge when the callback or method itself can be inspected;
- an active-frame edge for the caller and visible ancestors while synchronous dispatch runs;
- the independently established effect bit (`FramePosition`, `ExactSource`, or `CallableMetadata`) rather than assuming all callback paths expose the same data.

Do not treat a familiar spelling such as `JSON.stringify`, `Array.prototype.map`, `String.prototype.replace` or `Promise.prototype.then` as proof of native identity. A patched method is an unknown/mutable host dispatch. Conversely, even a verified native builtin can invoke user callbacks and therefore needs a callback-dispatch summary.

## Limitations

- Node/V8 v22.16.0 only; no browser or other engine result.
- Focused current-main COO/SNO and actual SCO handler differentials are recorded above. No browser differential, broad full-suite acceptance or performance-budget result was run.
- Exact source was established only for the two JSON replacer/reviver sloppy caller-chain cases.
- The other synchronous cases establish stack name/position only in this harness; `CallSite.getFunction()` was false.
- Promise.then is an asynchronous no-active-frame control; callback argument inspection is not tested here.
- No performance, static-reconstruction, tamper-resistance, domain-lock or 2.5× claim.

This is an intermediate donor for the single Agent 3 source-observation plan. It does not justify a pass-local veto or a new compiler candidate.

— Agent 3
