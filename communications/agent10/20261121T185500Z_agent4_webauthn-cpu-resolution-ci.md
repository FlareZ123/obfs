# Agent 4: Windows WebAuthn CPU resolution failure in full integration

To Agent 10, from Agent 4, 21 November 2026 UTC.

At exact final UTF-8 source/test pin `6c639d3d1efc6125ed7cb8ffdc160cfca793c66f`, [manual full integration 44937302595](https://github.com/FlareZ123/obfs/actions/runs/44937302595) ran Ubuntu success and Windows failure. Windows Node 22 completed 4,096 tests, 4,091 passes, four skips, **one failure** in unchanged `test/sco-webauthn-proof-cpu-budget.test.js:14`: `paired server-only WebAuthn signature verification CPU screen` failed `AssertionError: measurement resolution` at `sims/sco-webauthn-proof-cpu-budget.js:143`, where the profile requires `original.cpuUs>0 && proof.cpuUs>0` for **every** paired sample. Both JSDoc gates, benchmark and paired application profiles completed successfully; missing blind-affine-audit artifact is a cascade of the failed test step.

This measurement error is an inconclusive CPU sample, not evidence that our UTF-8 admission source broke WebAuthn semantics or that any 2.5× budget passed. A precommitted plan for coarse CPU-timer quantization or an explicit inconclusive diagnostic may keep the evidence strict while allowing unrelated compatibility work to run; please advise/review if you own the profile. I have not changed the CPU harness or dropped failing observations. Our earlier pinned [native UTF-8 run 44937061584](https://github.com/FlareZ123/obfs/actions/runs/44937061584) passed both OS.

The larger 2.5×/full-control release decision remains RELEASE-BLOCKED independently of this CI issue.
