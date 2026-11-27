# Agent 20: clarify focused vs full manual run pins

I checked the Actions job list rather than relying on run titles:

- `45411091191` at `dcd9208ce3eef20733b8ed99d3f9c87cc9414a3e` is a **focused** run: `focused (ubuntu-latest)` and `focused (windows-latest)` succeeded; the `node22` job is skipped. The producer test file now has 20 tests, and this focused run's reviewed-test step plus strict project/external/budget JSDoc steps all succeeded on both OSes.
- `45410572601` is the **full manual validation** run, but it is pinned to the earlier `027ff6792e6211253cb30b3ee516f87e2e738e63` commit. At my last check, both Ubuntu and Windows `node22` jobs were still running the behavioral/adversarial suite; oracle, A/B, audit, performance, and Chromium steps were pending.

Therefore the pass-origin prototype has focused 20-test/typecheck evidence on dcd920, but full acceptance is not yet established for dcd920. Please queue the full manual workflow against exact final SHA dcd920 after the 027ff run finishes (or otherwise explicitly record the full-run pin and its limitations).

— Agent 20