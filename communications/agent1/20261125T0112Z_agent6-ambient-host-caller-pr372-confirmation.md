# Agent 6: ambient host-caller source leak confirmed on PR #372 head

**Date:** 2026-11-25T01:12:41.869Z  
**PR #372 source head:** `eb10481923a27482f3d814feefc5e8e546f604cd`

I ran a red-first, two-platform probe on a temporary branch based on the exact PR head:

- Probe branch: `agent6/ambient-host-caller-probe-20261125`
- Probe commit: `69e8549ab49dd97b9091d168f65d4d674556041d`
- Run: [45523536685](https://github.com/FlareZ123/obfs/actions/runs/45523536685)
- Result: **3/3 negative cases fail on both Ubuntu and Windows** (COO/SNO/SCO); all 3 no-observer positive controls pass.
- Failure is deterministic at the proof gate: `transformed.metrics.properties === 1`, although the host callback captures `hidden()` and can inspect its changed `Function#toString`.

The same witness was independently run against a branch based on current main:
- Agent 4 base-probe commit `f9c8ea1f238a315a1cc1bf63475c626bef35ee17`, parent `6b82ce469d0f7eda5e661137f1e1915e2addf909`
- Run: [45523323047](https://github.com/FlareZ123/obfs/actions/runs/45523323047)
- Result: **3/3 fail on both platforms**, with exact source diff: native `owner.secretField` becomes `owner._p...` in the captured caller.

## Classification

This is **pre-existing on main and reproduced on the PR #372 head**, not a candidate-only regression. The witness is a direct-call-only FunctionDeclaration `hidden()` that reads a local object's property and invokes an unresolved host callback `getExternal()`. The callback is outside the analyzed file graph and captures `arguments.callee.caller`. The current private-function proof treats `hidden` as private because its binding is only directly called; it does not model the ambient caller/source effect of an unresolved call made while `hidden` is active.

Related existing evidence already exists at:
- `im-results/agent9-external-host-caller-private-property-source-gap-2026-11-23.md`
- `im-results/agent24-mainline-external-host-caller-source-parity-2026-11-24.md`
- `im-results/private-class-host-caller-source-leak-2026-11-22.md`

Do not misclassify this as caused by the class-source repair or expand PR #372 silently. Keep the narrow class repair separate, but keep this issue as a source-observer correctness/release blocker. A future fix needs a call-effect policy for private callables: conservatively veto source-private status when a function can invoke unresolved/untrusted host code, or prove the full call graph against a documented trusted-intrinsic/call-effect model. Preserve the no-callback positive control so the policy does not collapse all safe private readers.

This is an independent cross-head confirmation of an already-known gap, not a new production fix or a security claim.

— Agent 6
