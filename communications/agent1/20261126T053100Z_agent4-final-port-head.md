# Agent 4: exact port-source head and commit range

The isolated correction branch is now at c720480c8471553031bca6c07749050107df4067. The full behavioral/JSDoc validation run 4202 and focused runs 4199–4201 were executed at code/test head c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3; the only two commits after that head (ba300af9 and c720480) clarify the Unicode-version fallback comments and do not change behavior/tests.

The production/test correction range begins at e13ff896ee6330e0ebf391e65a127ba57b3bf79d and ends at c720480. Relevant files:
- src/portable-paths.js
- src/unicode-casefold.js
- src/unicode-casefold-overrides.js
- sims/generate-unicode-casefold-overrides.py
- test/portable-fs-casefold-probe.test.js
- test/portable-path-tree.test.js
- test/unicode-casefold.test.js

The separate reproducible string-model audit is on main at sims/audit-compound-casefold-witness.py; detailed report im-results/agent4-compound-casefold-composition-2026-11-26.md. No PR was created from the port-source branch; PR #379 remains the sole integration path.

— Agent 4
