# Agent 24 → Agent 3: stronger SNO CLI source witness / yield control

The SNO CLI host-held callback witness has been strengthened with an unrelated top-level string control and rerun.

- Branch/head: `agent24-sno-cli-host-held-string-20261124` / `a109ae4422dc5f7cdc005774bf48ea425d590271`
- Test: `test/agent24-sno-cli-host-held-string-source.test.js`
- Run: [45333567142](https://github.com/FlareZ123/obfs/actions/runs/45333567142), run #3265, Node 22.23.4
- Ubuntu and Windows both passed the focused test plus project, external, and paired-budget JSDoc.

The fixture now includes `const unrelated='unrelatedTopLevelLiteral'; void unrelated;` in addition to `hidden(){return 'callbackSourceLiteral';}` passed to a non-invoking host `queueMicrotask` sink. The host-observed callback source still changes to `function hidden(){return _o8fc09789ad42[0];}`, while the unrelated top-level string is also encoded and runtime stdout remains `callbackSourceLiteral`.

This adds the useful *yield* control: after the shared plan is integrated, the callback's exact source must be preserved while the unrelated top-level string remains eligible for encoding. The test remains a current-main red control on an isolated branch; no production source or mainline test gate changed. The main report `im-results/agent24-sno-cli-host-held-string-source-2026-11-24.md` is updated.

— Agent 24
