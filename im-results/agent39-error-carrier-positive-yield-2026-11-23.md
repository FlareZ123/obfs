# Catch and rejected-value source-carrier precision: matched positive-yield regression

**Author:** Agent 39. **Date:** 23 November 2026. **Status:** intermediate, source-pinned two-platform observation. **Release:** BLOCKED.

## Question and identical source control

A transitional source-safety scanner on `agent39/promise-named-rejection-probe-20261123` adds every catch parameter and selected Promise rejection callback first formal to name-wide sets. It assumes those names may carry `Error.stack` even when the actual thrown/rejected value is locally proved not to be a native Error.

Test `test/agent39-error-carrier-positive-yield.test.js` uses a closed-world two-module ESM graph. The producer's private `owner.longPrivateField` is returned through a private helper to the consumer, which computes a dynamic `key=['st','ack'].join('')` and reads one of these values:

1. `try { throw 1 } catch(caught) { caught[key] }`;
2. `await Promise.reject(1).catch(caught => caught[key])`;
3. `await Promise.reject({stack:'ordinary'}).catch(caught => caught[key])`.

All consumers select a `calculate()` value of **73** on the original graph. The test requires both native-versus-emitted Node execution equality and **one real protected-property rename**. This is a bounded positive-yield fixture under the ordinary unmodified Node runtime used by CI; prototype/host mutations can introduce additional effects and are separate trust assumptions.

## Reproducible source and two-platform findings

The **original test bytes are identical** on the two initial candidate/control branches: Git blob `8c27c3f2b2dc5ed58756ec532a7add28e2ab8332` at candidate source `faaced2856585becfc3ac1b7ffecf9a51ab97f87` and main-derived control `f0c3d72db3dff217101fa8439e4d0c379974293a`.

| Tested source | Ubuntu Node 22 | Windows Node 22 | Evidence |
| --- | --- | --- | --- |
| Candidate with name-wide catch/rejection aliases, `faaced285` | 0/3 positive checks, 3/3 failed; `observesFunctionSource` unexpectedly `true` | Same 0/3, 3/3 failed | [run 45167484035](https://github.com/FlareZ123/obfs/actions/runs/45167484035) |
| Frozen current-main control plus identical test, `f0c3d72` | 3/3 passed, each with exactly one renamed protected key and native/emitted `73\n` parity | Same 3/3 passed | [run 45167678078](https://github.com/FlareZ123/obfs/actions/runs/45167678078) |
| Candidate with explicit pre-assertion property metrics, `ac439b8` | 3/3 failed, `observes=true`, **0 protected-property rewrites** for each input | Same 3/3 and zero rewrites | [run 45168431352](https://github.com/FlareZ123/obfs/actions/runs/45168431352) |

The candidate diagnostics, captured in both failed jobs, contain:

```json
{"scenario":"caught primitive","observes":true,"propertyRewrites":0}
{"scenario":"rejected primitive","observes":true,"propertyRewrites":0}
{"scenario":"rejected plain record","observes":true,"propertyRewrites":0}
```

A later main commit adds the same three tests to the ordinary repository suite and `jsconfig.external.json`. The first full external-check attempt [45167969546](https://github.com/FlareZ123/obfs/actions/runs/45167969546) correctly exposed a new test-local broad `sourceType:string` JSDoc inference, fixed by explicitly typing the `SourceFile[]` test fixture. [Run 45168220952](https://github.com/FlareZ123/obfs/actions/runs/45168220952), exact main SHA `d3b72880ca3bdae13d87b0c06de2c748eeb1d8e6`, then passed the 3/3 focused test, project JSDoc, external JSDoc and paired budget JSDoc on **both** operating systems. No comprehensive full-suite, browser, hostile prototype or 2.5× compute claim follows.

## Interpretation and admissible next proof

This **demonstrates a positive-transformation-yield regression** in the earlier branch under the tested pristine Node execution context. Simply marking catch parameters or Promise handler formals as potentially Error-bearing by identifier spelling can protect a genuine `Error.stack` negative while suppressing unrelated private-owner rewrites. The experiment does not prove that current main is safe for caught or rejected Error stack observation; that remains a separate negative acceptance gate.

Replace name sets with lexical `BindingId` facts and value-provenance flow. Model explicit `throw`/catch and `Promise.reject`/callback edges under a proved Promise/native-dispatch contract; for truly unresolved values, retain fail-closed behavior. Add different-name, same-name-shadowing, catch/Promise and interfile controls. Carry `FrameContext` execution/stack edges separately from value carriers, so unknown host callbacks are not missed. Use selective source-span refusal where justified, paired with nonzero private property yield. Relevant background: [the integrated carrier/effect proposal](../workplace/source-observer-carrier-effect-contract-2026-11-23.md), [Agent 1 precision review](../communications/agent39/20261123T1055Z_agent1-catch-rejection-carrier-precision-review.md) and the prior source-pinned genuine Error negatives in [Agent 39's research branch](https://github.com/FlareZ123/obfs/tree/agent39/promise-named-rejection-probe-20261123).

No universal JS equivalence, stronger secrecy, authorization, source reconstruction resistance, or general strict 2.5× runtime claim is established. **The three-mode primary objective remains RELEASE-BLOCKED.**
