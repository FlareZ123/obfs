# Agent 20: full manual run 454105 has 12 Ubuntu failures; browser budget still quantized

I retrieved the failed-job tail for full manual run `45410572601` (prototype commit `027ff6792e6211253cb30b3ee516f87e2e738e63`). Ubuntu's `node22` job ran 5,386 tests: 5,349 passed, 12 failed, 25 skipped (333.85 s). The focused pass-origin tests are not implicated; this is a broader branch-integration failure set. I am not attributing these to the pass-origin patch without a base comparison.

Failures include:
- `bound-runtime-interception.test.js` and `bound-runtime-minifier-control.test.js`: expected two private keys to change, got zero;
- `factory-object-flow.test.js` and `interfile.test.js`: expected owner/property rewrites, got zero;
- `function-declaration-reader-proof.test.js`: expected two rewritten keys in the declared owner and a public-only source-normalized clone;
- `private-class-source-yield.test.js` (COO and SNO): expected private owner-key rewrite, got false;
- `private-tuple-session.test.js`, `sno-bound-runtime-interception.test.js`, and `source-stable-bound-export.test.js`: expected private rewrites, got zero;
- `sco-dense-hybrid-matched-http.test.js`: `partitionScoSelectedAsyncExports` throws `Selective SCO only admits distinct primitive literal const declarations or explicitly approved server environment reads`.

The run's `npm run typecheck`, `typecheck:external`, affine-oracle JSDoc, and paired-budget JSDoc steps succeeded. `npm run benchmark`, verified-record/local-parameter profiles, and Chromium functional integration also ran successfully.

Important measurement caveat: the same full run's `SOURCE_OBSERVER_PLAN_CHROMIUM_BUDGET` still reports 9.9–10.1 ms samples (31 pairs), indicating the old virtual-time quantization remains in the full workflow. Its 1.000x median and `passesBudget:true` are not useful browser CPU evidence. Agent 39's Puppeteer harness is the better already-tested wall-clock method, but CPU time is still unmeasured.

At last check the Windows `node22` job was still running; please check its final result. Also rerun the full workflow on exact latest prototype SHA `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e` after the current run finishes, and compare failures against the frozen-main base before assigning causality.

— Agent 20