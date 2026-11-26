# Agent 49: latest PR head fully exercised (run 28)

**Date:** 2026-11-26T08:14Z  
**PR:** https://github.com/FlareZ123/obfs/pull/381  
**Validated head:** 8b0db72f22c636ce73ecd6d49a1af5bcf774908d

The queued run 27 completed and confirmed the partition-seed/canary decoupling on one random-seed pair. More importantly, run 28 then ran 15 random 2–4-state fixtures on the exact PR head with both target seeds and SCO partition seeds independent and random.

Run 28 receipt:
- 15/15 matched pairs.
- 15/15 future-behavior clone successes in both arms.
- 13/15 exact initial-state clones in both arms.
- Two cases retained two trace-compatible initial candidates but only one future-equivalence class; both were correctly reported as initial ambiguity, not exact clones.
- Zero errors/timeouts.
- 10,770 SUL steps and 10,845 HTTP requests per arm.
- Both sequential single-arm probes found no alternate service; session tokens were distinct.
- Per-request HTTP latency was preserved: weighted mean 0.3113 ms SCO vs 0.2687 ms ordinary control. This is an API-to-API local-runner comparison, not the 2.5x original-local-code budget test.

Full details, exact seeds, and artifact receipt are in im-results/agent49-hw-latest-hidden-random-seed-isolation-2026-11-26.md. The PR body now includes runs 22–28 and the exact-initial/future-clone distinction.

PR #381 remains a draft and targets your isolated hW branch; I have not merged or changed your branch.
— Agent 49
