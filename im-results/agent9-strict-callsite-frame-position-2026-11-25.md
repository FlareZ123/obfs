# Strict V8 CallSite frame-position witness (2026-11-25)

**Status:** intermediate empirical result; Node/V8-specific. No production compiler change is proposed.

## Question

Does strict-function protection of `CallSite.getFunction()` prevent a host-controlled callback from observing source changes through V8 stack metadata?

## Result

No. On Node.js 22.23.4 / V8 12.4.254.21-node.57, the host observer cannot obtain a strict function object through `CallSite.getFunction()`, but it can still read the function name and call-site column. A private-property rename before the host callback moves that column.

The focused fixture uses a strict or sloppy `hidden` function that reads `owner.longPrivatePropertyName`, then calls an external host callback. The host callback captures an Error and reads its structured V8 CallSite. The source transformation is property-only; identifiers and strings are disabled.

| Mode | Emitted property | Native column | Emitted column | Runtime value |
|---|---|---:|---:|---:|
| COO | `_p05f3ab3229` | 103 | 92 | 21 / 21 |
| SCO | `_pdea91ecdb3` | 103 | 92 | 21 / 21 |
| SNO | `_pb99f445e33` | 103 | 92 | 21 / 21 |

The original property spelling is 23 characters; the generated spelling is 12 characters. The 11-column movement exactly matches the 11-character shortening.

For **sloppy** `hidden`, `CallSite.getFunction()` returns the callable and `Function.prototype.toString` exposes the changed function source. For **strict** `hidden`, `CallSite.getFunction()` is `undefined` and no function source is returned, but `getFunctionName()` remains `hidden` and `getColumnNumber()` still changes from 103 to 92. Thus strictness limits callable-object/source access, not frame-position observation.

## Reproduction

- Test-only branch: `agent9/strict-callsite-source-20261125`
- Test file: `test/agent9-strict-callsite-source-observation.test.js`
- Exact test commit: `289d956241c592b93d110b8a2a0c6a09413a0ada`
- Workflow: [45523964863](https://github.com/FlareZ123/obfs/actions/runs/45523964863)
- Node: `v22.23.4`; V8: `12.4.254.21-node.57`
- Ubuntu and Windows: 6/6 focused tests passed on each platform.
- Project, external-corpus, and paired-budget JSDoc checks passed on both platforms.

The host callback is deliberately sloppy, created with the Function constructor. V8 suppresses `CallSite.getFunction()` for strict frames and frames below a strict frame; a strict host callback would therefore hide the frame under test and produce a false negative. The final fixture keeps the observer callback sloppy while varying only the observed `hidden` function's strictness.

## Real Chromium strict-ESM confirmation

A separate real-browser fixture serves the native module and COO-generated module from a local HTTP server and executes both in headless Chromium. Because both are ESM, `hidden` is strict. A page-owned host callback captures only `new Error().stack`; it does not receive the function object.

- Focused workflow: [45524759755](https://github.com/FlareZ123/obfs/actions/runs/45524759755), successful.
- Ubuntu: the real Chromium test passed. The native frame was `native.mjs:2:67`; the generated frame was `generated.mjs:2:56`.
- Runtime values: `[21, 21]`.
- The 11-column shift again matches the 23-to-12-character property shortening.
- Windows: the browser test is intentionally skipped because this harness currently targets the Linux Chrome runner; project, external-corpus and paired-budget JSDoc checks passed.

Test: `test/agent9-strict-stack-browser.test.js`; harness: `sims/agent9-strict-stack-browser.js`; exact test commit `699193d056553f5f69d1ca582160216a5b525dde` on `agent9/strict-callsite-source-20261125`.

This adds a browser-side **Error.stack / FramePosition** observation for COO strict ESM. It does not establish browser `Error.prepareStackTrace` / CallSite support, SCO server-response behavior, cross-browser portability, or a full browser acceptance matrix.

## Interpretation and limits

- This independently confirms the existing `FramePosition` dimension in `workplace/source-observer-carrier-effect-contract-2026-11-23.md` on the repository's pinned Node 22.23.4 runtime.
- `FramePosition` is distinct from `ExactSource`: strict frames can hide the function object while still exposing source-coordinate changes.
- The structured CallSite observation is Node/V8-specific. The separate browser test establishes ordinary `Error.stack` frame coordinates in one headless Chromium environment for COO strict ESM, not browser CallSite support, other engines, universal stack-format stability, or a general host trust contract.
- This focused test is not full-suite acceptance, a 2.5x compute qualification, a confidentiality result, or a release-readiness claim. The product remains subject to the repository's existing release blockers.
- No production code was changed; the test remains on its isolated research branch to avoid expanding the active PR candidate or conflating focused evidence with comprehensive acceptance.
