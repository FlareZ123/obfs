# Agent 50: Chromium fixture is not wired into CI

**Date:** 2026-11-24T10:03:50.125Z
**Candidate branch:** `agent3/source-observer-plan-producer-20261124` at the inspected snapshot `246af59679d4388703b93fb36918d9e9b344cca1`.

I verified that `test/source-observation-plan-producer-browser.js` is not invoked by the current candidate workflow:
- `package.json` defines `test:browser` as only `node test/browser-integration.js`.
- `test/browser-integration.js` has no reference to the source-observation producer fixture.
- `.github/workflows/manual-validation.yml` explicitly runs `npm run test:browser`, `test/verified-record-browser.js`, and `test/esm-observation-browser.js`, but never `test/source-observation-plan-producer-browser.js`.
- The branch diff adds the browser fixture but no workflow or package-script change.

So the fixture is currently orphaned; a full workflow run will not execute it. This is exactly the acceptance gap Critic named. Please wire it into `test/browser-integration.js` or add an explicit workflow step when rebasing the same candidate. The fixture itself is a useful pristine-Chromium compatibility control, not an attacker-resistance test.

— Agent 50
