# Four-file ESM positive property-yield diagnostic (23 November 2026)

**Classification:** intermediate test evidence for existing compiler property-rename admission shortfall; not a security finding or proven bug in a particular guard.

## Original baseline

The repository's unchanged `test/interfile.test.js` requires `crossFile.objects===1`, `crossFile.properties===2` for a four-file closed-world ESM object graph. It currently observes **0 objects** and fails on unchanged-main [workflow 45252707202](https://github.com/FlareZ123/obfs/actions/runs/45252707202) at `93e983c3...`, both Ubuntu and Windows. A completely separate two-line ESM namespace-label patch in [draft PR #348](https://github.com/FlareZ123/obfs/pull/348) also fails with the same 0 vs 1 [workflow 45252460015](https://github.com/FlareZ123/obfs/actions/runs/45252460015). This is a baseline failure, *not* a regression caused by #348.

## 12-condition decomposition

`test/interfile-yield-diagnostics.test.js` (test-only branch `agent6/interfile-positive-yield-diagnostics-20261123`, source `93951cfbe2d5a68498222802ce4b52a07e1e8c95`) executes a 3-mode × 4-variant matrix, preserving the four-file shared owner:

- Modes: COO, SNO, SCO output.
- Variants: original source `globalThis.window.api.bridge`; that ambient member replaced by literal `10`; original graph with `strings:false,identifiers:false`; and `closedWorld:false` explicit no-cross-file control.

For **all 12** variants, `crossFile.objects=0`, `crossFile.properties=0`, `localObjects=0`. The normal and no-ambient variants had `localBindings=2`, the properties-only variants `localBindings=0`, confirming nontrivial identifier analysis separately. Therefore the known output refusal is **not lifted merely by removing the ambient `globalThis.window` chain, disabling string/identifier transforms, or switching runtime mode**. The result does *not* prove why the cross-file proof declines; the next step is to instrument the exact provenance/refusal branches of `src/cross-properties.js`.

Ubuntu focused test executed the full matrix and assertions successfully, but the overall [workflow 45253436135](https://github.com/FlareZ123/obfs/actions/runs/45253436135) is **RED** because strict external JSDoc found an unrelated concurrent-main error in `test/exact-cubic-compatible-cegar.test.js(104,17)`: `TS7006 Parameter 'x' implicitly has an 'any' type`. This came from other simultaneous main changes, not the diagnostic test. Do **not** describe the full workflow as passing; distinguish completed matrix observations from failed typecheck acceptance.

## Interpretation and next action

The 12 checks reject a simple explanation that the ambient host-root alone causes the graph-wide source observer guard, while leaving ownership/reflection/escape and external-source uncertainty unresolved. Preserve the positive-transform acceptance expectation rather than lowering it to zero; identify actual production admission conditions and compare against separate source-pinned positive examples before proposing a compiler change.
