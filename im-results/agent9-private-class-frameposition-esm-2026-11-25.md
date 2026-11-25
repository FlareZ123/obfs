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

The same experiment also gates the private-class admission to strict source (ESM or a top-level `use strict` directive). Its existing sloppy-CommonJS wrapper-source observer test passed 3/3 COO/SNO/SCO cases on Ubuntu and Windows in [45545069902](https://github.com/FlareZ123/obfs/actions/runs/45545069902). This is a conservative refusal of the class rewrite in the tested sloppy-CJS case, not a way to make the wrapper source identical after a rewrite; it does not establish safety against every possible strict-CJS runtime observer.

I also added an explicit `metrics.properties===0` assertion to the sloppy-CommonJS wrapper-source regression on the test-only branch. Focused run [45550204302](https://github.com/FlareZ123/obfs/actions/runs/45550204302) passed all 3 COO/SNO/SCO cases on Ubuntu and Windows, proving the tested sloppy-CJS source-observer case is refused rather than rewritten. A separate Node 22.23.4 strict-CJS CallSite control passed on both OSes in [45550251317](https://github.com/FlareZ123/obfs/actions/runs/45550251317): a sloppy preload observer could still read function names, filenames, lines, and columns, but `CallSite.getFunction()` was unavailable for both the strict worker and target CJS wrapper frames. This supports the narrow strict-source boundary against this specific caller/source-extraction path; it does not establish safety against every runtime, filesystem, or debugger observer.

This is positive evidence that the narrow source-span edit repairs both the 12-character strict-CJS +2-column case and the 23-character strict-ESM Chromium -20-column case while retaining the property rewrite. It is **not** a full fix or release qualification: the experimental path declines patterns/in-checks/shorthand, has not been tested with every other transformation pass or browser engine, and does not preserve CommonJS wrapper `Function#toString` equality if a rewrite is admitted; the current experiment avoids the tested sloppy-CJS case by restricting class admission to strict source. The source patch remains a separate experiment and has not been integrated into PR #372.

### Negative controls for unsupported syntax

The patch's refusal path was exercised on test-only branch `agent9/class-frameposition-esm-agent1-padded-20261125`. At the time of focused run [45547666685](https://github.com/FlareZ123/obfs/actions/runs/45547666685), the branch head was `a888f8ff58f380f01b1e12858e85856c7776eef4`. The run passed **6/6 cases on both Ubuntu and Windows**:

- shorthand owner key: refused in COO, SNO, and SCO;
- destructuring-pattern owner read: refused in COO, SNO, and SCO.

Each case asserts zero property rewrites, native/emitted value parity, and unchanged host-observed line/column. Project, external-corpus, and paired-budget JSDoc passed on both platforms. The current test-only branch head is `20b6a2a691ed73646e042ac741777688e7239409`; compared with Agent 1's source patch head `4e49ea5...`, it adds exactly two test paths: the strict-ESM browser test and this unsupported-shapes test. A later update to the browser test adds a combined-transform case and is under separate validation.

This verifies conservative refusal for shorthand and destructuring patterns in the tested source shapes. The explicit `in`-check refusal guard is not yet covered by a negative test.

## Full-pipeline FramePosition check: identifier renaming remains unsafe

Focused run [45547869135](https://github.com/FlareZ123/obfs/actions/runs/45547869135) at test branch head `20b6a2a691ed73646e042ac741777688e7239409` first passed the property-only browser case, then failed the next case with property and identifier transforms enabled:

- metrics: `properties=1`, `bindings=1`, `literals=0`;
- values: `[23,23]`;
- native strict-ESM frame: `1:185`;
- generated strict-ESM frame: `1:201` (**+16 columns**).

The string option was enabled, but the two-character marker `"xy"` was below the current string-transform threshold; no literal rewrite occurred. This failure therefore isolates the identifier/binding pass, not the string pass. Windows explicitly skipped the browser tests and passed all three JSDoc checks; the Ubuntu job failed only at the intended FramePosition assertion.

Conclusion: the per-occurrence property-span edit repairs the property pass in isolation, but does **not** make the full transform pipeline FramePosition-safe. Identifier renaming must also preserve source spans or be disabled for affected source, and string transforms need separate measurement. A follow-up isolation run [45548406939](https://github.com/FlareZ123/obfs/actions/runs/45548406939) uses a longer string literal and independently tests identifier-only, string-only, and combined transforms; results pending.

### Independent identifier/string isolation (corrected run)

Corrected focused run [45549919941](https://github.com/FlareZ123/obfs/actions/runs/45549919941) at test-only branch head `0cf89ffbe63d61e0912341359c62676d446b8291` exercised each pass independently and then together. All three tests preserved values, but all three failed the FramePosition assertion on Ubuntu:

| Enabled transforms | Metrics (properties / bindings / literals) | Native frame | Generated frame | Difference |
|---|---:|---:|---:|---:|
| Property + identifier; strings disabled | 1 / 1 / 0 | 1:185 | 1:201 | +16 columns |
| Property + string; identifiers disabled | 3 / 0 / 1 | 1:205 | 3:198 | +2 lines, -7 columns |
| Property + identifier + string | 3 / 1 / 1 | 1:205 | 3:214 | +2 lines, +9 columns |

The identifier-only case uses a short marker binding with `strings:false`; it triggers one binding rewrite and no literal rewrite. The string-only case uses a 22-character marker and triggers one literal rewrite; the string pass adds a two-line decoder prelude, moving the later module frame to line 3. The combined case activates both. All values match exactly: `[23,23]` for identifier-only and `[43,43]` for string-only/combined. The property count is 3 in string-enabled cases; it is a file-level aggregate and does not identify which keys were renamed. The pipeline runs the property pass before string encoding, so the later string helper is not the source of that property count.

The Windows job succeeded, explicitly skipping the Chromium fixture, and all three JSDoc gates passed on both OSes. Ubuntu failed only at the intended FramePosition assertions. The earlier run [45548406939](https://github.com/FlareZ123/obfs/actions/runs/45548406939) is superseded: its identifier fixture did not trigger a binding rewrite and its property-count assertion was too strict. Use 45549919941 as the authoritative isolation receipt.

Conclusion: **the property edit, identifier renamer, and string encoder each need separate source-position treatment**. Per-occurrence property padding alone does not preserve FramePosition under the full pipeline. Identifier renaming needs same-span replacement or refusal; string encoding needs to avoid moving the prelude/later source positions (or be refused where FramePosition is observable).

## Interpretation and limits

This is a candidate-only strict-ESM browser FramePosition counterexample for the new `privateClassNodes` admission: the class proof permits one owner-key rewrite, but it does not account for a later host-observable module frame whose column depends on earlier source on the same line. It complements Agent 1's Node/CommonJS wrapper-source and strict-CommonJS FramePosition witnesses; it is not a substitute for them.

The observation is V8/Chromium-specific evidence from one Ubuntu headless-browser fixture. It does not establish identical behavior in every browser engine, a general model of all source-position effects, or a universal security theorem. It does establish that strict ESM and withholding the callable object are not sufficient to preserve FramePosition under this candidate rewrite.

**Disposition:** keep PR #372 draft/unmerged. The class admission needs to include enclosing-module FramePosition effects in its proof or conservatively refuse the affected source shape. The new browser regression should be integrated into the PR's own focused test suite and rerun against a synchronized candidate/base pair. The global strong-protection objective remains **RELEASE-BLOCKED**.
