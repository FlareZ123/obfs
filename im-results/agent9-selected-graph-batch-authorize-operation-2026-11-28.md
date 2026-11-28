# Selected SCO graph batching: mandatory per-operation authorization at construction

**Status:** intermediate engineering security/correctness result. Not an academic strong-obfuscation proof or a release acceptance receipt.  
**Date:** 2026-11-28  
**Research identity:** Agent 9  
**Source branch:** [`agent9/selected-batch-required-preflight-20261128`](https://github.com/FlareZ123/obfs/tree/agent9/selected-batch-required-preflight-20261128)  
**Corrected source pin:** `672a06e0e1bddde996b39a9735e62fb4b5d70693`

## Root cause and policy boundary

The compiler provides two SCO ESM graph composition APIs with optional batching:

- `createScoGraphHandler` in `src/sco-graph.js` derives all protected batch route IDs from a sealed compiler snapshot, requires `authorizeOperation`, and passes mandatory `batchPreflightRoutes` to `createScoHandler`.
- `createScoSelectedGraphHandler` in `src/sco-selected-graph.js` also creates compiler-owned batch method IDs when a selected module is compiled with `batch:true`, but previously forwarded only the application's selected handler options and registry. It **did not demand the callback**, nor derive `batchPreflightRoutes` from its sealed manifest.

Under the shared `src/sco.js::handleRpc` implementation, per-operation authorization executes only when `authorizeOperation` exists. Thus a selected-graph batch could be configured with `authorizeRpc` alone. Authorized coarse requests could execute private child methods without individual permission checks, whereas the whole-graph compositor refuses such construction. This is an **unsafe configuration acceptance** and inconsistent security contract; it is **not** a bypass of a present, correctly implemented per-operation callback or of a denied coarse `authorizeRpc` gate.

The correction derives the exact protected route IDs from the **sealed** selected-graph snapshot, makes `authorizeOperation` mandatory whenever any selected partition has `batchMethod`, and refuses caller-supplied `batchPreflightRoutes` override. The existing `createScoHandler` then verifies recognized direct batch-helper identity and enforces the outer and each inner callback against isolated parsed JSON argument views. No public facade format or plain nonbatch `authorizeRpc` mode changes. The returned batch helper is still bounded by `maxBatchCalls` and existing exact-one-outer-argument validation.

## Reproduction and exact evidence

1. Start from the test-only branch source `f1a60eec2210696203d59244470705665db9bd85`. In `test/sco-selected-graph.test.js`, `selected graph batch routes require immutable compiler-owned inner preflight` first requires constructor refusal without `authorizeOperation`. [Manual multi-module SCO graph run 46127949598](https://github.com/FlareZ123/obfs/actions/runs/46127949598) **FAILED on Ubuntu and Windows**: each had 88/89 tests pass; the new test failed at `Missing expected exception.` The other 88 passed. Test failure is expected red-first confirmation.
2. The production and type patch was committed to `src/sco-selected-graph.js` and `src/sco-selected-options.js`; regression includes two-child HTTP batch execution, one permitted and one forbidden child (all-or-nothing preflight, zero private side effects), and valid batch output. Exact patched source `672a06e0e1bddde996b39a9735e62fb4b5d70693`. [Manual multi-module SCO graph run 46128047241](https://github.com/FlareZ123/obfs/actions/runs/46128047241) **PASSED on both Ubuntu and Windows**, including real SCO HTTP graph behavior and the workflow's scoped strict JSDoc.
3. A separate full `manual-validation.yml` run was dispatched at identical patched pin: [run 46128142897](https://github.com/FlareZ123/obfs/actions/runs/46128142897). Its final outcome must be reviewed separately; the focused success does not substitute for this complete gate.

## Scope, residuals and review

- `authorizeOperation` callback remains the trusted server integrator's responsibility. The compiler's construction check cannot prove that it enforces a meaningful policy; the callback may still authorize everything. The server must enforce transaction/isolation if policy changes during batch work, as documented in `src/rpc-batch-policy.js`.
- This hardening closes an opt-in configuration gap; it does not prevent legitimate users from relaying authorized SCO responses, hide the distributed facade from an attacker, or establish immunity to a compromised server.
- Per-child policy execution adds normal server-side request work for formerly under-protected selected batches. It is not evidence of a universal 2.5× bound on actual executed workloads. The original primary strong-protection objective remains RELEASE-BLOCKED.
- Porting to Agent 31's draft PR #339 should be separately reviewed; do not merge a draft just because a focused suite is green. Targeted review request: `communications/agent31/20261128T0858Z_agent9-selected-batch-mandatory-policy-review.md`.

## Commands

On the patched source (Node.js 22, declared dependencies installed):

```bash
node --test test/sco-selected-graph.test.js
npx tsc -p jsconfig.sco-graph.json
```

These are the focused checks executed on each OS by `.github/workflows/manual-sco-graph.yml`. The full workflow also checks broader SCO private-graph and sample behavior.
