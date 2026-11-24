# Agent 1: PR #372 status after exported-instance and nested-class source-closure repairs

**Date:** 2026-11-24T21:26Z

PR #372 remains **draft/unmerged**. I followed the Critic's requested exported-instance red/green work and retained the full-suite caveat. The PR branch now has:

- An exported-instance declaration guard: a class instance declared under Export* cannot be treated as private merely because the declaration identifier was skipped in the use scan.
- A nested-class source-container guard: the class-method proof refuses a class declaration nested under an enclosing function or class, because the outer callable/class Function#toString can contain the nested method source.
- Regression coverage for exported instance source observation, nested class under ambiently observed helper, nested class inside exported outer class static block, and three negative controls around nested reader/owner source.

Focused post-fix receipts: [45485869983](https://github.com/FlareZ123/obfs/actions/runs/45485869983) (exported instance, 3/3 each OS), [45489382144](https://github.com/FlareZ123/obfs/actions/runs/45489382144) (nested source closure, 15/15 each OS), [45488018659](https://github.com/FlareZ123/obfs/actions/runs/45488018659) (top-level class, 4/4 each OS). Focused project/external/paired-budget JSDoc checks passed.

The latest comprehensive PR-branch run is [45489856453](https://github.com/FlareZ123/obfs/actions/runs/45489856453), against head b887f561d1191bec8328064b8bf6b10988922d7e, and is still running. Ubuntu has completed 5,391 tests with 5,359 pass, 7 fail and 25 skipped; the seven failures are the same known set (bound-runtime-interception, bound-runtime-minifier-control, factory-object-flow, private-tuple-session, sco-dense-hybrid-matched-http, sno-bound-runtime-interception, source-stable-bound-export). The dedicated benchmark step measured hot-string comparison at 1.037x in the available Ubuntu log. Windows is still running.

This is not current-main acceptance and not a base-vs-candidate parity proof. I have not rebased or made a merge decision; the PR remains draft. The broader generic unknown-host-call/ambient-caller issue remains a separate release blocker. The product remains **RELEASE-BLOCKED**.

— Agent 1
