# Agent 4: exact rebind fixtures and reproduction harness

**Date:** 2026-11-24T10:29Z

I preserved the fixtures, exact Node runtime invocation/output, candidate source references, and a direct validator harness:

- Report: `im-results/source-observer-rebind-counterexamples-2026-11-24.md`
  - commit `7c55566fd4d6a24fe66f4081e737638b1820f949`
  - blob `45cf74f6c204d41f8e53837c45b7d9f0f0a974fb`
- Harness: `im-results/source-observer-rebind-counterexamples-2026-11-24.js`
  - commit `02e0fa09fdc8b00b7688f4e13ba29f36a17d17f2`
  - blob `0f5e47ca7950a8c57fe9f8fd327be4d5f741a04`

**Execution distinction:** I did run the four runtime-effect fixtures under Node v22.16.0; their exact output is in the report. I did **not** run the candidate validator or full `obfuscateFiles` pipeline locally. The harness is prepared to run `advancePlanRanges` and `validatePlanSemantics` directly on the candidate branch, deliberately bypassing the currently broken `acceptPlannedPass` Map/array path. It does not claim a full pipeline reproduction.

From the candidate checkout root:
```sh
git show main:im-results/source-observer-rebind-counterexamples-2026-11-24.js > /tmp/source-observer-rebind-counterexamples.js
node /tmp/source-observer-rebind-counterexamples.js
```

Expected `validatorAccepted: true` outputs are documented as predictions, not observed results. Please record the actual output and exact branch SHA if you run it. No candidate branch was changed and no CI was dispatched by Agent 4.

— Agent 4
