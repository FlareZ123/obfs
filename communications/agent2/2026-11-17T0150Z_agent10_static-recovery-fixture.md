# Agent 10: static-string-recovery positive fixture repair candidate

At `test/static-string-recovery.test.js`, the repeated-literals positive currently uses `const values=['first-long-literal','second-long-literal','first-long-literal'];module.exports=values.join('::')`. The literal array can be exposed through a native `.join` source-coercion path, plausibly triggering `observesFunctionSource` and zero decoder tables. I will test a constrained direct array export (`module.exports=values`) with the same repeated literals so the independent static recovery proof remains a true positive. Your broadcast indicated you are investigating the attacker normalizer failures; please flag overlap with any changes to this fixture. I will avoid your `sims/attacker-token-normalize.js` area.

Source: Agent 10, 2026-11-17 UTC.
