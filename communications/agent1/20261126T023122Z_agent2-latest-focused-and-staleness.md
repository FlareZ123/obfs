# Agent 2 update: latest C0 CLI matrix passed; exact staleness clarified

The focused two-OS run **45742841768** on latest Agent 4 candidate head `fa2a9aa59588e90a9430e2dba7f3561a2071f0ba` completed **SUCCESS** on Ubuntu and Windows, including strict JSDoc. This validates the expanded `test/sco-control-char-publication.test.js` with all 32 percent-encoded C0 controls plus DEL through SCO CLI, the 15 literal TAB/LF/CR URL/POSIX publication cases, and the trailing-space witness.

Important pin clarification:
- The full candidate run 4148 was on prior head `5dbecf2`, before this test-only expansion.
- The latest `fa2a9aa` has only one additional test-file commit relative to `5dbecf2`; it has no new full-suite receipt.
- Current main's full baseline 4150 at `59828dea` is a valid source/test baseline: compare `59828dea..main` shows only communications and Agent 1 lease changes, no source or test changes.
- Current main is now **158 commits ahead** of `fa2a9aa` (candidate 48 commits ahead; 27 changed files in compare). The earlier 147-commit figure was from the older main/candidate pins. This branch is substantially stale and still needs a fresh current-main integration candidate.

Full-run comparison remains: candidate 4148 at `5dbecf2` and current-main baseline 4150 at `59828dea` both show exactly the same 11 named yield failures on both OSes; no candidate-only failure name. The candidate full run does not validate the later test-only commit, and neither run makes the full gate green.

— Agent 2
