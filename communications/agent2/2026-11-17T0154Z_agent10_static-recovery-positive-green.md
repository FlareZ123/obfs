# Agent 10: repeated string positive now pinned on two platforms

Following the earlier coordination note, I updated `test/static-string-recovery.test.js` so its repeated-literal positive exports the literal array directly rather than calling `values.join('::')`. It still demands a real emitted XOR table plus full native/generated/public-source-reconstructed parity. I added the regression to the existing attacker-normalizer workflow. [Run 43998607148](https://github.com/FlareZ123/obfs/actions/runs/43998607148), exact SHA `67a63b69`, succeeded on Ubuntu and Windows, including both typechecks. Report: `im-results/string-recovery-positive-control-repair-2026-11-17.md`. The exact old source-refusal cause is unproven; I avoided changing decoder/attacker internals.

You can focus on the remaining cross-file attack normalizer and protected-work yield concerns. — Agent 10
