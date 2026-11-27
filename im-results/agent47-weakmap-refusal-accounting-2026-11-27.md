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

Test-only branch `agent47/weakmap-regression-refusal-accounting-20261127` at `c4b8daac72861b82f9c6378f6e184d213e7a69e0` adds only the empty-refusals assertion in each case. Remote file bytes verified. No production source or workflow was changed. The existing manually dispatched [focused run 45922612320](https://github.com/FlareZ123/obfs/actions/runs/45922612320) completed green at that exact head: Ubuntu, Windows and macOS focused jobs and all three JSDoc steps per OS succeeded; comprehensive node22 was skipped. Independently verified 2026-11-27 06:06 UTC.

Interpretation: a successful strict run demonstrates that these two fixtures actually completed the native/emitted comparison for all three mode flags; it does not demonstrate actual SCO HTTP/SNO launcher coverage or universal semantics. These tests disable property/string transforms and the negative cases require zero identifier rewrites in the Storage unit, including the unrelated function, so they do not demonstrate selective positive yield. If strict execution fails, distinguish intentional documented compiler refusal from unexpected compiler or runtime errors; a separate refusal lane should assert a specific compiler-side diagnostic, not catch arbitrary failures. Keep unsupported-input refusal evidence separate from successful native/emitted execution.

## Coordination

Agent 7 owns the differential suite, Agent 4 the browser receipt, Agent 10 the comprehensive acceptance gate. No parallel production integration, new workflow, or full CI run is proposed here. The project remains RELEASE-BLOCKED. The sealed LLM trial remains BLOCKED / NO RESULT as documented by Agent 13 (2026-11-26 private-channel disposition); no new model experiment or public surrogate was attempted.


### Integration disposition (2026-11-27 06:06 UTC)

The shared Agent 1 donor `aa54147277fb98b244de25c4dd532cad294102ad` already includes both strict empty-refusals assertions in `test/agent7-weakmap-source-observer-falsifiers.test.js` (blob `698503ac745eae35ec7af4ade84cfa183471228c`, lines 606 and 1014). Its exact-head focused [45932268213](https://github.com/FlareZ123/obfs/actions/runs/45932268213) passed on three OS and its [full Node 22 run 45932380908](https://github.com/FlareZ123/obfs/actions/runs/45932380908) passed on Ubuntu and Windows. The test-only branch requires no separate integration patch. These successes do not resolve the additional Agent 3 CFG matrix: original [45938336784](https://github.com/FlareZ123/obfs/actions/runs/45938336784) and corrected-fixture [45938520606](https://github.com/FlareZ123/obfs/actions/runs/45938520606) both completed red on all three focused OS. The latter exact test-only pin `bf96c212eb0b64abbb9d5bb69ed00c23d5b9b8b6` includes actual native/emitted source mismatches (confirmed from failed-job tails for object-rest, class-static outer binding, function side effect and catch predecessor). Full node22 was skipped in those two focused runs. Do not infer complete semantic parity from earlier green receipts. Agent 3 owns the matrix; retain the existing integration funnel and do not dispatch redundant runs. No separate production PR or CI workflow is needed for the refusal assertion.

Full corrected-run log audit (all three OS, existing Actions MCP receipt): each job executed 19 cases, 8 passed, 11 failed, zero skipped. In every OS, all 11 misses have nativeShared=true, group=false, local=false, four storage-unit binding rewrites and actual native/emitted source mismatch in each of the three core-API mode labels (33 failing comparisons per OS, 99 repeated observations overall, not 99 independent bugs). Six shared-prototype detected controls have exact parity with zero rewrites, while the two corrected nonshared controls have exact parity and four rewrites in each label. Thus the original fixture errors are resolved in the corrected receipt; the eleven semantic failures remain. This is Node ESM fixture execution with a DOMString-compatible host mock, not browser/HTTP/SNO launcher evidence. Aggregate binding counts are not proof of selective unrelated-binding yield. No new production or test edits are needed for this receipt; incorporate it into the existing candidate decision rather than rerunning the same pin.
