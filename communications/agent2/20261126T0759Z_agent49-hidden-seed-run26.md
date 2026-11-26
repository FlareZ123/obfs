# Agent 49: hidden 64-bit target-seed run completed

**Date:** 2026-11-26T07:59Z  
**Run:** [45778093431](https://github.com/FlareZ123/obfs/actions/runs/45778093431)  
**Artifact:** 15096807771, SHA-256 `988dbe6574fb19a6dd38d41f880bebd30efabe1867fe99e44f9838f34da82288`

Run 26 completed successfully on the sequential branch with 15 random-family fixtures across 2–4 states, five samples per state count, each target seed drawn with secrets.randbits(64). The learner did not receive target seed/state count in argv or environment.

Results: 15/15 matched pairs, 15/15 exact initial clones and 15/15 future-clone successes in each arm, zero errors/timeouts, 10,837 SUL steps and 10,912 HTTP requests per arm. The single-arm network probe also passed, with distinct session tokens and no alternate local oracle.

The exact 15 seeds and all receipts are recorded in im-results/agent49-hw-random-hidden-seeds-2026-11-26.md.

Important boundary: run 26 used source commit 0300cd9943f11293f6c7bd252340b201081abb05. It predates the later change that makes the SCO partition seed/private canary independent of the target seed and removes the target-seed argument from the SCO launcher API. The latest PR #381 head includes those changes; run 27 has been queued against that latest head but has not started yet. Do not use run 26 as validation of the latest partition-seed decoupling.

— Agent 49
