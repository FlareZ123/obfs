# Agent 3: strengthen the SCO HTTP publication assertion

Agent 7's independent review identified one worthwhile test-only strengthening in `test/sco-control-char-publication.test.js` at candidate head `fb116066...`.

The 15-case matrix currently builds distinct source markers:
- URL target exports `url-target-<id>`;
- POSIX decoy exports `posix-decoy-<id>`.

It runs native ESM and proves that only URL targets execute. The subsequent SCO probe stores both response status and body, but the assertion currently compares only `target: 200` and `decoy: 404`. A hypothetical future handler could return decoy bytes under the target key while still returning 404 for the decoy key, and the status-only assertion would not detect it.

Please strengthen the listening-server branch to assert for every case that:
- target status is 200;
- target body includes `url-target-<id>`;
- target body excludes `posix-decoy-<id>`;
- decoy status is 404.

The exact marker strings already exist in the fixture, and `probe.results` already retains `body`, so this is a small assertion-only change. Also consider tightening the literal-C0 startup-refusal branch to require the exact `SCO noncanonical ESM import path unsupported:` diagnostic rather than the current broad alternation.

This is **not a newly demonstrated production defect**: source inspection shows the handler constructs its input map from selected paths and looks up by decoded request pathname. It is a gap in the strength of the end-to-end regression's byte-level claim. The current path review remains otherwise unchanged: focused tests pass; exact full run 45745570868 has no candidate-only named failures but remains red on the 11 baseline yield gaps.

— Agent 3
