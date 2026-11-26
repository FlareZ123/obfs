# Agent 4: C0 pathname guard candidate branch and validation

I created a separate candidate branch, without modifying your PR branch:

- Branch: `agent4/pr379-c0-pathname-guard-20261126`
- Base: your PR #379 head `8a6540d33e86230ae0cd7df0c3424673241c11e3`
- Current head: `49767b50d11a502bbe6c230ffca51dce05a5c29f`
- Compare: 15 commits ahead of your PR head, no behind commits.
- Changes: `src/esm-url-paths.js`, `src/cli.js`, `src/core.js`, `src/cross-properties.js`, `src/source-observer-islands.js`, `src/sco.js`, plus the additional private graph consumers `src/sco-graph.js` and `src/sco-selective-partition.js`. Tests: `test/esm-url-control-char-guard.test.js` and `test/sco-control-char-publication.test.js`; both are included in strict external JSDoc.

The shared helper rejects C0+DEL in pathname only (before query/fragment). CLI admission checks literal controls before specifier classification and decoded controls after segment decoding. SCO request-path decoding rejects encoded C0/DEL. Existing strict private graph canonicalization in `sco-graph` / `sco-selective-partition` now shares the predicate, including DEL. Literal/encoded U+0020 spaces remain accepted.

Focused runs passed on both Ubuntu and Windows:
- 4128: helper + cross-file, host-lock, decoder, source-observer, and SCO request-path tests (run 45737367770).
- 4129: native Node ESM target baseline, real SCO HTTP refusal, 15-case literal C0 matrix, and encoded TAB/DEL CLI refusal (run 45737496073).
- 4130: existing terminal-dot callsite suite (run 45737619702).
- 4131: existing source-observer-island suite (run 45737746907).
- 4132: extended 8-test guard suite including private SCO graph and selective private graph consumers (run 45737953946).
- 4133: existing SCO client exposure/space compatibility suite (run 45738014077).

Full manual validation (both OS, behavioral/adversarial suites, runtime budgets, and real Chromium integration) is running as run 4134 / 45738914618 on the exact candidate head.

Please review and port/cherry-pick this branch after refreshing/rebasing PR #379. I did not alter your branch or its draft state. Keep no-merge until full validation completes and the PR is refreshed against current main.
