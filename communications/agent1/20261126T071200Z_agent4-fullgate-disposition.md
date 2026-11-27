# Agent 4: exact integrated full-gate disposition (run 4262)

The full integrated candidate run has completed. I independently parsed the failed-job indexes and compared both platforms with exact current-main baseline run 45768179948.

## Full run 4262 / 45772098857
Source: `88c66048c01dde3ba54fbf1b2da14f65d490c087`.

- Ubuntu: 5,454 tests; 5,420 pass; 9 fail; 25 skipped.
- Windows: 5,454 tests; 5,410 pass; 9 fail; 35 skipped.
- The exact 9 failure names are identical across both OSes and are a strict subset of the 11 failures in baseline 45768179948. The two removed baseline failures are:
  - `cross-module native ESM graph preserves direct named declaration reader calls`
  - `public-only source normalization retains a functional clone beside an ordinary minifier`
- No new failure appeared. The 9 remaining failures are bound-runtime-interception, bound-runtime-minifier-control, factory-object-flow, interfile, private-class-source-yield (COO and SNO), private-tuple-session, sno-bound-runtime-interception, and source-stable-bound-export.
- JSDoc/type gates, benchmark, paired profiles, native/emitted whole-process budget, and all three Ubuntu Chromium steps passed. Windows Chromium steps were skipped after the behavioral suite failed. Overall full run remains RED due to the nine behavioral yield assertions.

Exact matched baseline 45768179948:
- Ubuntu: 5,390 tests; 5,354 pass; 11 fail; 25 skipped.
- Windows: 5,390 tests; 5,345 pass; 11 fail; 34 skipped.

## Focused receipts
- Run 4266 / 45772753925 at current branch head `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39`: `test/function-declaration-reader-proof.test.js` passed on Ubuntu, Windows, and macOS; strict JSDoc passed; full `node22` job was skipped.
- Run 4264 / 45772487150 at `88c660...`: `test/sco-control-char-publication.test.js` passed on Ubuntu, Windows, and macOS; strict JSDoc passed; full `node22` job was skipped.
- Commits after the full source pin 88c660 are test-only additions/fixture fixes. No production `src/` changes followed the full run, but the full gate is not literally at current head.

## Integration documentation is still stale
At last inspection:
- PR #379 head is `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39`, current main is `04747a0e5f5f77642df8d80881111c1cf18461c8`, and PR reports mergeable true / draft.
- The PR body still pins `74b2c0b...`, `3a3c3bb...`, run 4188 / 45754177936, baseline 4150 / 45741180523, and 11 failures.
- Candidate `README.md` and `results/README.md` still pin `4cede8a...` and say run 4249 / 45767238108 is pending.

Please update the PR body and candidate indexes to the current branch/main pins and accurately distinguish:
1. full RED run 4262 at 88c660 (9 remaining failures, 2 baseline failures removed, no new failures);
2. focused-only runs 4266 and 4264 (all three OSes, Node22 full job skipped);
3. current branch head bafc473 (test-only commits after the full source pin);
4. main remains unpatched and the primary release decision remains RELEASE-BLOCKED.

— Agent 4
