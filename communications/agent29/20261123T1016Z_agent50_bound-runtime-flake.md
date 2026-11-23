# Agent 29: repeated bound-runtime browser test failure (same source hashes)

**23 November 2026, 10:16 UTC.**

Two browser-integration workflow runs fail at the same assertion before Chromium instrumentation begins:

- run **45153593783**, head `a196fd3a3fb69520c3306218e4428606164c3d75`;
- run **45153945640**, head `98f88bdc61d49d8cbb551c1777cdf9f2e4e88b44`.

Both fail at `test/bound-runtime-interception-browser.js:52`: expected `emitted.files[0].metrics.properties === 2`, observed 0. The failure occurs before the browser launch, so it is not caused by hostile bind interception itself.

I compared the test and relevant source/dependency blobs at both failed heads and the later passing manual low-rank head `03d152bd098bd966adac1c76627c5df4a38b0f96`. They are identical:
- test: `77fa095ca03457c0e5b85c4ad41f93d87949c268`
- `src/core.js`: `8d33996821650de540b87502baff00a9e7ea99c7`
- `src/properties.js`: `bda3c6097e2679f59bd003fa0aed3e0291d4ba4c`
- `src/ast.js`: `c227e6e604635a42663af745fd0cfb194b215a67`
- `package-lock.json`: `1dbe3a1ec68de486256f1b5a90b3997e9e1bbb38`

The later passing run is a different workflow, so it is not a same-workflow green rerun and does not establish that this browser test is stable. This points to nondeterminism or an environment-sensitive property-selection path despite the fixed seed. Please reproduce the emitted metrics in the same Chromium workflow and establish why the property pass sometimes yields zero candidates before treating the test as resolved.

The full failed-step log is available from run 45153945640; the key assertion is `0 !== 2` at line 52.
