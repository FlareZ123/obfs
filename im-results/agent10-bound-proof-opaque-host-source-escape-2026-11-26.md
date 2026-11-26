# Agent 10 — bound-only private-function proof: opaque-host source escape

**Date:** 2026-11-26 UTC  
**Status:** reproduced against an experimental candidate; not production-integrated  
**Evidence class:** focused, two-platform semantic counterexample and strict-JSDoc validation

## Summary

Agent 2's experimental extension admits a uniquely bound const arrow function as private when its only non-declaration use is the receiver of a direct, static, non-optional bind call with primitive literal arguments. That rule does not establish that the effective bind property is the native intrinsic, nor does it model the custom method's this receiver.

A source-level replacement of Function.prototype.bind can pass that receiver to an opaque host callback. The callback can inspect the target's source even though the source being obfuscated contains no toString, String, reflection, or other explicit source-reading operation. The candidate then renames a private owner key inside the target, changing the source string observed by the host while preserving the target's numeric result.

This is a bounded semantic false-safe in the experimental bound-only proof. It is **not** a finding against current main: current main's privateFunctionNodes gate still requires a direct call and does not admit a bind receiver.

## Candidate and source pins

- Candidate source branch: agent2/pr379-review-probe-candidate-20261125
- Candidate source head: 3693bf0a227003cd61f111dea1bb3823e1a222e6
- Review branch: agent10/bound-proof-custom-bind-review-20261126
- Review/test head: 900bf7fc1be26f52c8d742f456d02cc213d3b2ad
- Current-main snapshot inspected: 230db468aa982c20ab16559ed5de6dd2e0449a98
- Candidate comparison at that snapshot: 25 commits ahead / 377 behind; merge base d801d8d24444071dc0072c936513018cd93c505b.

The review branch was deliberately based on Agent 2's candidate, not current main. The candidate contains unrelated ESM/path work as well as the bound-proof change; do not cherry-pick or merge the branch wholesale. In the relevant src/properties.js block, current main admits only directCall, while the candidate additionally admits bindCallUse for a const arrow and a literal-argument bind call.

## Reproducer

The test module has:

    const owner = { secretField: 7 };
    const nativeBind = Function.prototype.bind;

    Function.prototype.bind = function () {
      external(this);
      const target = this;
      return (...args) => Reflect.apply(target, null, args);
    };

    const internal = () => owner.secretField;
    const hot = internal.bind(null);
    const result = hot();

    Function.prototype.bind = nativeBind;
    process.stdout.write(JSON.stringify([
      globalThis.__capturedSource,
      result
    ]));

The test harness supplies external from a Node --require preloader that is **not** included in the source given to the obfuscator. That opaque callback records Function.prototype.toString.call(value). Thus the candidate cannot see the host callback's implementation when analyzing the input module.

The candidate reports one property rewrite. The native and transformed executions both return 7, but the host-observed function source differs: the original contains owner.secretField, while the transformed target contains the generated property spelling. The mismatch is therefore source-observation semantics, not an ordinary return-value mismatch.

The same witness is exercised through three in-program mutation paths: direct Function.prototype.bind assignment, assignment through a Function.prototype alias, and Object.defineProperty on an aliased prototype.

## Reproducible evidence

1. **Red-first reproduction:** run [45761880020](https://github.com/FlareZ123/obfs/actions/runs/45761880020), candidate commit a4250ef1505b4e5d157bba5b3b28ef6150a7f16a. The initial negative expectation (properties === 0) failed on both Ubuntu and Windows: actual property rewrite count was **1**. This is the direct false-safe observation.
2. **Witness-preserving test:** run [45762032860](https://github.com/FlareZ123/obfs/actions/runs/45762032860), review head 900bf7fc1be26f52c8d742f456d02cc213d3b2ad. The three mutation variants passed on both Ubuntu and Windows because the test explicitly asserts the candidate's one rewrite, unchanged numeric result, and changed host-observed source string. Project JSDoc, external JSDoc, and paired-budget JSDoc all passed on both platforms.
3. **Narrow negative controls:** run [45761792732](https://github.com/FlareZ123/obfs/actions/runs/45761792732), commit a4250ef1505b4e5d157bba5b3b28ef6150a7f16a. Four controls passed on both platforms with the same three JSDoc stages: direct/aliased/descriptor-based custom bind returning the original target followed by an in-program hot.toString(), plus a custom wrapper that reads a returned owner. These cases are caught by the existing source-observer or owner-escape paths. They do not cover a custom bind that passes this to an opaque host callback.

The review tests are in:
- test/agent10-bound-proof-custom-bind.test.js
- test/agent10-bound-proof-opaque-host.test.js

These were focused workflow runs. The node22 full-suite job was skipped. No full acceptance, browser acceptance, runtime-budget qualification, or production integration is claimed.

## Interpretation and limits

- The newly admitted proof treats syntactic bind receiver use as private without proving the method's effective implementation or receiver effects.
- The existing visible-source-observation controls are useful and passed. They do not establish that every path by which a target function can escape is modeled.
- The custom implementation can receive the target as this; the source-observer analysis does not connect that ThisExpression to the target function and therefore misses the opaque callback's source observation.
- Current main at 230db468... remains direct-call-only in this block. This report does not claim the reproduced false-safe is present on main.
- The candidate branch is substantially diverged from main. This evidence isolates a concern in its bound-only admission; it does not validate the rest of the candidate or any of the three production modes.

## Recommended disposition

Keep the bound-only admission out of production until its assumptions are established. The safe interim is to retain the direct-call-only rule. Any future extension should either prove the effective native Function.prototype.bind identity at the call site under the declared runtime assumptions, or model the custom receiver path and reject when this can reach an unknown host. Add the three opaque-host mutation variants above as negative controls before considering integration.

The native-bind positive-yield experiment remains useful, but it is not evidence that arbitrary in-program bind replacement is safe. This finding is a correctness/effect-analysis boundary, not a claim that bound exports are generally unsafe or that the 2.5x limit has been met.

## Current-main baseline control

The same three opaque-host variants are now protected by a test on current main:

- Test: test/agent10-bound-proof-opaque-host-baseline.test.js
- Test commit: a99e6ff37b9df30aac6f6e60024b3d21894876cf
- Focused run: [45762844948](https://github.com/FlareZ123/obfs/actions/runs/45762844948)

All three variants produced zero local property rewrites and preserved the host-observed source/output on Ubuntu and Windows. Project JSDoc, external JSDoc, and paired-budget JSDoc all passed. The full Node 22 suite was skipped. This is a focused baseline receipt, not full acceptance.

A separate direct-call positive-control attempt was removed because the chosen fixture did not qualify for a current-main property rewrite (metrics remained zero). No direct-call positive-yield claim is made from this work.

## Three-mode candidate check

The same direct-assignment opaque-host witness was also executed through all three candidate mode settings:

- Test: test/agent10-bound-proof-mode-matrix.test.js
- Candidate review head: e7bb4e02c407b28396fc497568a6461bcf63ba16
- Focused run: [45763097057](https://github.com/FlareZ123/obfs/actions/runs/45763097057)

COO, SNO, and SCO each admitted one property rewrite; the emitted function still returned 7, while the host-observed source differed from the original. Both Ubuntu and Windows passed the witness assertions and all focused JSDoc stages. The three mutation-route matrix (direct/alias/descriptor) remains COO-only; the all-mode check uses direct assignment. The full Node 22 suite was skipped, and this is not a full mode acceptance or 2.5x runtime result.

## Expanded current-main mutation baseline

The current-main regression guard was expanded from three to seven in-program mutation paths: direct assignment, alias assignment, descriptor-based defineProperty, computed-key assignment, Reflect.set, Object.assign, and Object.defineProperties.

- Test: test/agent10-bound-proof-opaque-host-baseline.test.js
- Test commit: cffc6987a0194e45d2d84830f2ac5666a85e4344
- Focused run: [45765037038](https://github.com/FlareZ123/obfs/actions/runs/45765037038)

All seven variants were refused with zero property rewrites and source/output parity on Ubuntu and Windows. Project JSDoc, external JSDoc, and paired-budget JSDoc passed on both platforms. The full Node 22 suite was skipped.

## Receiver-map helper audit (Agent 5 research branch)

I also tested the same receiver escape against Agent 5's research helper, workplace/agent9-ambient-call-bindingid.js, on a separate audit branch:

- Audit branch: agent10/receiver-map-bind-audit-20261126
- Test: test/agent10-receiver-map-bind-audit.test.js
- Focused run: [45765509420](https://github.com/FlareZ123/obfs/actions/runs/45765509420)

The test wraps the target in an IIFE to remove the independent top-level CommonJS external-reachability condition. Runtime confirms the custom bind implementation passes the target to external(this), but the helper summary reports hostHeldCallable=false and safe=true. A control that additionally passes the bound result to external(hot) is recognized as hostHeldCallable=true and safe=false.

This isolates a gap in that research helper's receiver model: it resolves the explicit bound result back to its target, but does not connect the target function to the ThisExpression of an in-program custom Function.prototype.bind implementation. Both tests passed on Ubuntu and Windows with all focused JSDoc stages. This is a research-helper finding, not a production-main defect or a claim that the helper's broader receiver work is invalid.
