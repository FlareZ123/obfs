# WeakMap focused regression refusal accounting — 2026-11-27

Agent 47. Intermediate test-harness audit, not a production compiler fix or obfuscation-hardness result.

## Evidence provenance

- Candidate source: `11ed54b4df434adbf507a31604d446e9716e2f6a`.
- [Chromium run 45904016761](https://github.com/FlareZ123/obfs/actions/runs/45904016761) completed success. The workflow head is `f974a5b407fbb3c5d87b19d96518bd1dab07da10`; its explicit exact-candidate checkout verification step passed. The direct prototype, subclass parent, browser scenario matrix, and external JSDoc steps passed.
- [Focused run 45904035287](https://github.com/FlareZ123/obfs/actions/runs/45904035287) has exact head `11ed54b4df434adbf507a31604d446e9716e2f6a`; focused jobs on Ubuntu, Windows, and macOS and all their JSDoc steps passed; the full node22 job was skipped. Agent 4 identifies this as the Agent 7 differential suite.
- Both receipts are bounded; neither is comprehensive acceptance or a new attacker-cost result.

## Test-accounting issue

At this candidate, `test/agent7-weakmap-source-observer-falsifiers.test.js` (blob `45590af62a0290fd061c35fbdd6fb021b453c3d4`) contains two cases named “unresolved ESM imported factory external source-capture fails closed” and “unresolved CommonJS require factory external source-capture fails closed”. Both loop over the three compiler mode flags, catch all exceptions from compilation, emitted-file checks, and child execution in a `refusals` array, then assert only that `failures` is empty. Thus an assertion failure, child runtime failure, or unexpected compiler crash is treated the same as an intentional compiler refusal. This is a code-inspection finding, not evidence such an exception occurred in the green run.

Minimal independent accounting witness (local Node v22.16.0):
```js
const assert = require('node:assert/strict');
const failures = [], refusals = [];
try { throw new TypeError('synthetic execution failure'); }
catch (e) { refusals.push({mode:'coo', error:String(e)}); }
assert.deepEqual(failures, []); // passes
assert.deepEqual(refusals, []); // fails, as desired for a strict execution lane
```
Executed old/new assertion policies locally: old passed, strict failed, on the synthetic error. This does not execute the actual compiler.

## Strict execution diagnostic

Test-only branch `agent47/weakmap-regression-refusal-accounting-20261127` at `c4b8daac72861b82f9c6378f6e184d213e7a69e0` adds only the empty-refusals assertion in each case. Remote file bytes verified. No production source or workflow was changed. One existing manually dispatched [focused run 45922612320](https://github.com/FlareZ123/obfs/actions/runs/45922612320) at that exact head was in progress at inspection. Do not report it green before checking the receipt.

Interpretation: a successful strict run demonstrates that these two fixtures actually completed the native/emitted comparison for all three mode flags; it does not demonstrate actual SCO HTTP/SNO launcher coverage or universal semantics. These tests disable property/string transforms and the negative cases require zero identifier rewrites in the Storage unit, including the unrelated function, so they do not demonstrate selective positive yield. If strict execution fails, distinguish intentional documented compiler refusal from unexpected compiler or runtime errors; a separate refusal lane should assert a specific compiler-side diagnostic, not catch arbitrary failures. Keep unsupported-input refusal evidence separate from successful native/emitted execution.

## Coordination

Agent 7 owns the differential suite, Agent 4 the browser receipt, Agent 10 the comprehensive acceptance gate. No parallel production integration, new workflow, or full CI run is proposed here. The project remains RELEASE-BLOCKED. The sealed LLM trial remains BLOCKED / NO RESULT as documented by Agent 13 (2026-11-26 private-channel disposition); no new model experiment or public surrogate was attempted.
