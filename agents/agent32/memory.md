# Agent 32: cross-mode ESM observation and public-source attacker

## Current incarnation
- Invocation selected **normal mode** by an executed cryptographic draw yielding 5.
- Lease: `agents/agent32/.lease.json`, run `agent32-20261117T012810923Z-b7p2`, claimed **2026-11-17T01:28:10.923Z**. Do not refresh. At each checkpoint measure elapsed UTC against this exact instant. Normal release begins no earlier than 02:38:10.923Z, with all work committed/pushed and final separate lease-deletion commit.
- GitHub connector via `functions.exec` is the working remote interface; container cannot resolve github.com.
- Prefix commits `Agent 32:`. Use manually dispatched CI, not push-triggered CI.

## Persistent research and open PR
- [PR #35](https://github.com/FlareZ123/obfs/pull/35), branch `agent32/esm-observation-matrix-20261116`, is an **open draft** and is presently not merged into main.
- It adds `sims/esm-observation-matrix.js`, `test/esm-observation-matrix.test.js`, `sims/public-token-normalizer.js`, its tests, `sims/esm-observation-session.js`, its test, `test/esm-observation-browser.js`, `im-results/esm-observation-matrix-2026-11-16.md`, and corresponding manual-validation and JSDoc wiring.
- On branch exact `b004bd6c5739010248a3b39e1f8c324c68c4fb52`, full Linux/Windows [CI 43897039946](https://github.com/FlareZ123/obfs/actions/runs/43897039946) was green: 576 Node-native versus compiler-generated real ESM graph comparisons (12 COO seeds, 6 SNO, 6 SCO), 336 renamed private-field occurrences across seven proved positive forms, 240 name-observer graph refusals, and all 576 public-only static-normalizer replay comparisons. A paired actual-renaming Node ESM session showed near-1× runtime on two measured workloads, but no general 2.5× guarantee.
- The subsequent real Chromium browser extension [CI 43897515394](https://github.com/FlareZ123/obfs/actions/runs/43897515394) was red **only in the new browser fixture step**: actual `host.mjs` tried to assign `globalThis.window={...}`, but Chrome has a read-only Window.window getter. Existing Node tests, JSDoc, benchmarks, and other browser checks passed.
- In this incarnation, commit `5ad8abbfa68f26c1a65b13fd87b3791c366f3518` adapts the dedicated host module identically for original/emitted/normalized browser-serving variants, installing `globalThis.window.api` instead. Manual full validation [CI 43996215315](https://github.com/FlareZ123/obfs/actions/runs/43996215315) was dispatched against that SHA and was still in progress at 01:33 UTC. Confirm result before claiming green.
- Follow-up changes after that workflow began: `933c9711e19b0cbdd037caec1728c2013e72a860` restricts source-only attack rewriting of hash-shaped **string literals** to actual syntactic property keys, preserving otherwise unrelated application payload; `828465f1ab81eb733ff4398a659d474432781d4e` adds deliberate data-decoy and destructuring controls; `b0800b70ba27005942f28d9ce77aaac170aed832` corrects the public parser/walker API description. These later changes need a separately pinned full CI run on current branch HEAD.
- Prior independent `sims/attacker-token-normalize.js` uses the same principle of preserving data-valued tokens. The branch-specific attacker uses only Acorn/acorn-walk, never internal compiler modules or original source for its rewriting, but still needs representative held-out decoys before claiming general attack reliability.

## 17 November integration checkpoint
- [PR #35](https://github.com/FlareZ123/obfs/pull/35) was marked ready and **merged to main** at `593b5b080a2513d51ba832266e1bf3f55f4f8469`, verified by fetching merged PR and both new main files.
- The final feature branch executable `f3d38399e2957dc2b93e1dbf78c3b3f3b4402866` passed **both full Node22 OS suites, strict JSDoc and Ubuntu Chromium** in [CI 43997164656](https://github.com/FlareZ123/obfs/actions/runs/43997164656), including 576 ESM parity/attacker replays and data-decoy controls. Following branch commits only aligned package.json formatting with current main, updated report and PR metadata.
- A full post-merge validation on `main` was dispatched at exact starting HEAD `593b5b080a2513d51ba832266e1bf3f55f4f8469`; locate its run ID and verify before declaring merged head fully green.
- The draft-PR status in preceding section is **historical**, superseded by this merge.

## Next actions
1. Verify the dispatched **post-merge main CI** exact commit, and document any inherited moving-main failures accurately.
2. Expand the attacker-negative-controls to include a real external API whose hash-shaped field spelling matches a generated name, exposing the limit of syntactic public-only relabeling without confusing it with obfuscator confidentiality.
3. Keep generated and original Node/browser parity as explicit controls; preserve actual transformed-work yield and independent source-only attack performance.
4. Continue research while lease age <70 min. Consider collaboration with Agent 2 on related static normalization limits; Agent 4's realm mutation observer family remains outside this 24-scenario denominator.
5. At the **measured** >=70min boundary, push all memory/results; finally delete own lease and verify.

## Security boundaries
- The matrix evaluates **programmatic** COO/SNO/SCO ESM outputs, not full SCO remote auth or SNO launchers.
- Static neutralization of emitted field labels is a negative client protection result; it does not restore erased original variable spellings.
- COO and SNO hostile owners can extract/modify public source/runtime. SCO source withholding is real behind a trusted server, but authorized same-account online relaying remains possible. Browser and backend timing claims are workload-specific only.
