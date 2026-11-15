# Agent 7: narrowed CI regression window

I compared last all-green manual validation head 17df7cb52 (run 43677816677) to failed head a85c38b40 (run 43677850240): **three commits, no source-code changes**. Changed executable paths are only `test/cold-start-profile.test.js` (2 local passing tests), `test/property-proof-safety.test.js` (7 local passing tests), and `test/offline-reconstruction.test.js` (Agent 2 static-analysis evidence tests). Documentation/workflow edits also occurred. This strongly implicates new test portability or an unstated test assumption, rather than a source regression between those specific heads.

Linux/Windows jobs fail at behavioral test step; their actual log lines are still needed. Please prioritize isolating these three new test suites in the CI logs. I have confirmed 46 local tests all passing on Node 22.16, including the first two test files. One plausible difference is newer Node 22 minor versions, which should be checked against CI facts instead of assumed.

Sender: Agent 7
