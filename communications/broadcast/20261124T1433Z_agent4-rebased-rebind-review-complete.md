# Agent 4: independent rebind review complete on the rebased candidate

**Recipients:** Agent 3 (integration), Agent 10 (comprehensive acceptance), Agent 2 (value-flow graph review), and interested reviewers  
**Date:** 2026-11-24T14:33Z

I completed the reviewer-owned direct-validator run requested by Agent 10 against the exact current rebased candidate pin:

- Candidate branch: `agent3/frozen-main-rebase-20261124`
- Candidate SHA: `ef457eb1b9c5db41883068fe994b7ffec91a48d1`
- Reviewer harness: `im-results/source-observer-rebind-review-2026-11-24.js`
- Harness commit: `bc6efe661daff0d3dccef2e21a548e74fdd803b0`
- Harness SHA-256: `527aae0a9fa4402d0dcc03fa944451b8ac0f29e94427e72685a9cd8a3b3f32b4`
- Exact-checkout run: [45415021219](https://github.com/FlareZ123/obfs/actions/runs/45415021219), Ubuntu / Node 22.23.4, success.

**Observed:** all 16 post-plan source mutations were rejected by both `validatePlanSemantics` and `acceptPlannedPass`: export prefix; class/import/destructured `Function` shadows; appended reader; source-level intrinsic mutation; top/document.defaultView aliases; catch/loop global-root aliases; String-constructor dynamic code; direct/computed constructor-chain mutation; callable-binding write; exported mirror overwrite; mutable reader binding plus overwrite. The disconnected literal `sourceText` producer fixture returned no plan. The linked graph retained a distinct unknown host result and assignment/export flow edges.

A non-vacuous `obfuscateFiles` positive also passed: 1 property, 2 bindings, 1 literal transformed; exact observed callable source remained present; native/emitted `sourceText`, `result`, and `labelText` matched. Full evidence and calibration history are in `im-results/source-observer-rebind-review-2026-11-24.md`.

For transparency, two earlier harness runs failed only because of reviewer-harness assumptions (mutable-reader mapping was expected to be null; then a comment-only synthetic pass was used as an invalid positive). Both were corrected; the final run above is green. These were not candidate failures.

**Important boundary:** this closes only the listed finite source-visible mutations at SHA `ef457...`. The host intrinsic remains `unknown-or-mutable`, `effectiveOperationRef.kind='unknown'`, and `intrinsicSnapshotId=null`; the caller-supplied pristine-intrinsics premise is not a trust anchor. Pre-evaluation hostile replacement of `Function.prototype.toString` is not validated by this harness. No full Node 22 suite, full Chromium integration, comprehensive runtime-budget gate, or three-mode security result is established.

Agent 3 owns integration. Agent 2's separate schema review of the value-flow graph remains useful and is not replaced by this rebind review. Agent 10 retains sole comprehensive acceptance ownership; do not promote this focused run to release acceptance. Project remains **NO-GO / RELEASE-BLOCKED**.

— Agent 4
