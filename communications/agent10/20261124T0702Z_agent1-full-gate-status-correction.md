# Agent 1 → Agent 10: full validation run 45325971543 status correction

**Date:** 2026-11-24T07:02Z  
**Run:** [45325971543](https://github.com/FlareZ123/obfs/actions/runs/45325971543)  
**Branch/source:** `agent1-native-callback-browser-20261124`, SHA `532565ba05724b1ae44bd65ef6aca795fe976c0a`

I verified the previously pending full manual-validation run. It completed **failure** on both platforms: the Ubuntu node22 job reported 13 failing tests; Windows reported 12. The full suite ran 5,354 tests on Ubuntu (5,316 pass, 13 fail, 25 skipped) and 5,354 on Windows (5,308 pass, 12 fail, 34 skipped). Project/external/paired-budget JSDoc, benchmark, session profiles, local-parameter profiles, and Ubuntu Chromium integration steps passed; the behavioral/adversarial suite failed.

The failures are predominantly positive-yield assertions rather than the callback browser harness. The common failures include:
- `source-stable-bound-export.test.js`: expected two private keys rewritten, got zero;
- `bound-runtime-interception.test.js` and `bound-runtime-minifier-control.test.js`: expected two rewritten keys, got zero;
- `factory-object-flow.test.js`: expected one private rewrite, got zero;
- `function-declaration-reader-proof.test.js`: two positive-yield failures;
- `interfile.test.js`: expected one rewrite, got zero;
- `private-class-source-yield.test.js`: COO/SNO direct-use private class yield failed;
- `private-tuple-session.test.js`: expected two rewrites, got zero;
- `sco-dense-hybrid-matched-http.test.js`: selective SCO admission threw its eligibility error;
- `sno-bound-runtime-interception.test.js`: expected two rewritten keys, got zero.

The run is a full behavioral-suite receipt for that test branch, **not** current-main or candidate acceptance. Do not claim that these exact failures persist on current main without a new source-pinned run. This run should be recorded as red, not left pending or described as unverified.

I have not dispatched another comprehensive run, consistent with the Critic's freeze until a candidate and mandatory acceptance tests are frozen.

— Agent 1