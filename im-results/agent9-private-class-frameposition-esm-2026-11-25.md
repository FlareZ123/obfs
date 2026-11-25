# Agent 9: strict-ESM private-class FramePosition browser witness

**Date:** 2026-11-25  
**Status:** intermediate, source-pinned browser counterexample; not release acceptance.

## Question

Agent 10 requested adapting the existing strict-ESM Chromium FramePosition witness to the exact top-level private-class shape admitted by PR #372, then comparing the PR candidate against pre-PR current main. The point is to determine whether a host callback that receives no callable can observe source changes through a later strict-ESM module frame.

## Fixture and measurement

The one-line ESM fixture is:

```js
const owner={longPrivatePropertyName:21};class Reader{read(){return owner.longPrivatePropertyName;}}const reader=new Reader();const value=reader.read();captureHostStack();export {value};
```

A page-owned classic-script callback implements `captureHostStack` and only records `new Error().stack`. The module invokes it after the class and direct instance read, on the same physical source line. It receives no class, instance, method, function object, or source string. The harness imports native and compiler-emitted modules in the same real headless Chromium page, compares exported values, and extracts the module frame's line and column.

The COO compiler call uses `sourceType: 'module'`, `closedWorld: true`, `properties: true`, `identifiers: false`, and `strings: false`. The test asserts native/emitted value parity and exact module-frame coordinate parity.

## Results

| Source snapshot | Property rewrites | Native frame | Emitted frame | Values | Focused result |
|---|---:|---:|---:|---:|---|
| PR #372 candidate `499060b780fc1b355df7d9610711f77280217276` | 1 | 1:153 | 1:133 | 21 / 21 | **RED** |
| Current-main baseline `c41b591cbe989ca4b6d86eca93700471df9e9ba7` | 0 | 1:153 | 1:153 | 21 / 21 | **GREEN** |

On the candidate, the generated private key was `_p27361e8f2a`; the host-observed module frame moved **20 columns earlier** even though the exported value remained 21. The exact candidate test output was:

```text
AGENT9_PRIVATE_CLASS_FRAMEPOSITION {"runtime":"Chromium","privateProperty":"longPrivatePropertyName","propertyRewrites":1,"emittedPrivateName":"_p27361e8f2a","native":{"line":1,"column":153,"frame":"    at http://127.0.0.1:44819/native.mjs:1:153"},"generated":{"line":1,"column":133,"frame":"    at http://127.0.0.1:44819/generated.mjs:1:133"},"values":[21,21]}
```

On the baseline, the compiler conservatively performed no property rewrite and both frames remained at column 153.

## Reproduction pins

- Candidate evidence branch: `agent9/class-frameposition-esm-pr372-20261125`
- Candidate test commit: `b67a24b76217c7a39af7f7421c00ea3514cd22dd`
- Candidate focused workflow: [45545516250](https://github.com/FlareZ123/obfs/actions/runs/45545516250)
- Baseline evidence branch: `agent9/class-frameposition-esm-main-20261125`
- Baseline test commit: `c6ada9e5c063cf4f147b3d2ebf10fa1a9669e420`
- Baseline focused workflow: [45545522393](https://github.com/FlareZ123/obfs/actions/runs/45545522393)
- Test: `test/agent9-private-class-frameposition-browser.test.js`
- Each evidence branch differs from its pinned source parent by exactly one path: `test/agent9-private-class-frameposition-browser.test.js`. The candidate compare is PR head `499060b...` → `b67a24b...`; the baseline compare is main `c41b591...` → `c6ada9e...`. No compiler, production, workflow, package, or lockfile files were changed in either experiment.
- Candidate PR: [#372](https://github.com/FlareZ123/obfs/pull/372), head unchanged at `499060b780fc1b355df7d9610711f77280217276` when checked at 04:17 UTC.

The focused workflow executes the browser test on Ubuntu; the Windows test is skipped by the explicit platform guard. The baseline workflow passed on both OSes, including project, external-corpus, and paired-budget JSDoc. In the candidate workflow, the Ubuntu job failed at the intended red assertion before downstream JSDoc steps; the Windows skip job and its JSDoc steps passed.

The baseline branch was created from main at `c41b591cbe989ca4b6d86eca93700471df9e9ba7`. Main subsequently advanced to `086ec24973a88c287ee60a4c1bd9969a2852feb4`; a source-pinned comparison found only agent-memory, communication, intermediate-report and research-script changes in that interval, with **no changes under `src/`, `test/`, `bin/`, workflows, package metadata, or lockfiles**. Thus the tested baseline production/test tree remains current-main-equivalent at that comparison.

## Repair experiment: per-occurrence UTF-16 span preservation

Agent 1's experimental branch `agent1/class-frameposition-preserving-experiment-20261125` at source commit `4e49ea529e1f52289f4cdb92b1e1bd7564e73039` changes the property edit path to preserve each rewritten key/member token's original UTF-16 source-span length. For a shorter valid replacement, it appends trailing spaces inside the replaced span; it conservatively declines the current proof if patterns, in-checks, or shorthand forms are present.

Two independent controls now pass against this exact patch:

1. The long-key strict-ESM Chromium test was copied to test-only branch `agent9/class-frameposition-esm-agent1-padded-20261125` at test commit `8354a121a40c5a029559f464b13703140987f53a`. That branch adds only `test/agent9-private-class-frameposition-browser.test.js` to the patch source. Focused run [45547175867](https://github.com/FlareZ123/obfs/actions/runs/45547175867) passed on Ubuntu: one property rewrite to `_p27361e8f2a`, native and generated frames both `1:153`, values `[21,21]`. Windows explicitly skipped the Chromium fixture; project, external, and paired-budget JSDoc passed on both platforms.
2. The short-key strict CommonJS FramePosition control already present on Agent 1's patch branch passed in [45545075284](https://github.com/FlareZ123/obfs/actions/runs/45545075284): 3/3 COO/SNO/SCO tests on Ubuntu and Windows, with all focused JSDoc checks passing.

This is positive evidence that the narrow source-span edit repairs both the 12-character strict-CJS +2-column case and the 23-character strict-ESM Chromium -20-column case while retaining the property rewrite. It is **not** a full fix or release qualification: the experimental path declines patterns/in-checks/shorthand, has not been tested with every other transformation pass or browser engine, and does not fix CommonJS wrapper `Function#toString` equality. The source patch remains a separate experiment and has not been integrated into PR #372.

## Interpretation and limits

This is a candidate-only strict-ESM browser FramePosition counterexample for the new `privateClassNodes` admission: the class proof permits one owner-key rewrite, but it does not account for a later host-observable module frame whose column depends on earlier source on the same line. It complements Agent 1's Node/CommonJS wrapper-source and strict-CommonJS FramePosition witnesses; it is not a substitute for them.

The observation is V8/Chromium-specific evidence from one Ubuntu headless-browser fixture. It does not establish identical behavior in every browser engine, a general model of all source-position effects, or a universal security theorem. It does establish that strict ESM and withholding the callable object are not sufficient to preserve FramePosition under this candidate rewrite.

**Disposition:** keep PR #372 draft/unmerged. The class admission needs to include enclosing-module FramePosition effects in its proof or conservatively refuse the affected source shape. The new browser regression should be integrated into the PR's own focused test suite and rerun against a synchronized candidate/base pair. The global strong-protection objective remains **RELEASE-BLOCKED**.
