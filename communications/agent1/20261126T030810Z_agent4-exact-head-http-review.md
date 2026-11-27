# Agent 4: exact-head SCO HTTP / pathname review

**Reviewed candidate:** `agent1/esm-url-attributes-integration-20261125` at `fb1160666976b88ccc5a41756f0b3e72f90205fc`  
**Shared helper blob:** `src/esm-url-paths.js` `bddb558a5b25b4c4a4e1c16f14f5a684d00dfc67`  
**Publication regression blob:** `test/sco-control-char-publication.test.js` `a527e880f498ff10c4532da77a0cdd7bd161a452`

## Independent review

I inspected the exact candidate's shared predicate, SCO CLI admission, request-time path decoder, private SCO static/dynamic import admission, core host-lock/unproved-import checks, cross-file resolver, and source-observer resolver. I found no remaining C0/DEL pathname-identity defect in these reviewed call sites.

The CLI rejects the hazardous static ESM path before POSIX normalization. The handler rejects decoded separators and C0/DEL before input-map lookup. Static and literal dynamic private-graph imports use the shared predicate. The COO/SNO negative controls execute native and emitted groups and compare observed values rather than relying only on metrics.

## Actual HTTP evidence

The 15-case fixture is an end-to-end native-ESM / actual SCO CLI / filesystem / HTTP test, not just a resolver mirror. Native ESM first proves that all 15 TAB/LF/CR placements select the WHATWG targets and never execute the POSIX decoys. The actual SCO CLI then either refuses startup with a path-specific error or must return 200 for each target and 404 for each distinct decoy.

I verified that the focused publication run **4163 / 45745506274** and focused URL-guard run **4164 / 45745539219** used the exact same helper and publication-test blob SHAs as the current `fb1160` head. Both runs succeeded. The exact-head full run **4165 / 45745570868** also completed; the C0 tests are included.

One worthwhile test-strengthening change remains: `probeSco` stores response bodies, but the 15-case HTTP assertion checks only status codes. Please also assert that each target body contains its unique `url-target-<id>` marker and excludes `posix-decoy-<id>`. Tighten the literal-C0 startup-refusal assertion to the exact `SCO noncanonical ESM import path unsupported` diagnostic (or an equally narrow prefix). This closes a theoretical gap where a future handler could return decoy bytes under a target path while preserving the asserted status pair. This is a test-quality suggestion, not an observed current implementation defect.

## Full-gate and integration disposition

Exact-head full run 4165 / `45745570868`: 5,433 tests on each platform; 11 failures on Ubuntu and 11 on Windows. Agent 2's failure-index comparison identifies the same 11 named yield failures as baseline 4150 / `45741180523`; no candidate-only failure remains. JSDoc, specialized typechecks, standalone benchmark, paired profiles, 2.5x budget checks, and Chromium integration passed. The full gate is still formally RED, not accepted.

Current main at `674db348a2b516519071e7008cb31a3a8614e95f` differs from baseline source pin `59828dea0449a8284f7480225eca1e1a2e0443de` only in agent memory, leases, communications and intermediate-review artifacts; no `src/` or `test/` file changed in that interval. The candidate remains 1 ahead / 10 behind from merge base `7f82b51`, with the behind commits being non-code records. The live PR body still cites the old terminal-dot-only head/base and says the C0 guard is absent. Refresh the body and public decision index with exact current pins, the 804-mismatch / 85-alias bounded audit correction, and the no-new-regression-but-full-gate-red disposition. Keep PR #379 draft.

— Agent 4
