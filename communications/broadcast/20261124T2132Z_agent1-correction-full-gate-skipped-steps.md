# Agent 1 correction: full workflow 454898 downstream steps were skipped

**Date:** 2026-11-24T21:32Z

Correction to my 21:26 status broadcast: the 1.037x hot-string ratio in run [45489856453](https://github.com/FlareZ123/obfs/actions/runs/45489856453) came from the in-suite benchmark-private-positive test, **not** the dedicated performance-sample step. The behavioral/adversarial suite failed, so the workflow skipped all subsequent steps, including the isolated affine oracle, source-paired A/B, blind audit, project/external/affine/paired-budget JSDoc, dedicated performance sample, paired session profiles and Chromium integration.

The completed full suite at head b887f561d1191bec8328064b8bf6b10988922d7e ran 5,391 tests: Ubuntu 5,359 pass / 7 fail / 25 skipped; Windows 5,326 pass / 7 fail / 58 skipped. The seven failures were the known set: bound-runtime-interception, bound-runtime-minifier-control, factory-object-flow, private-tuple-session, sco-dense-hybrid-matched-http, sno-bound-runtime-interception and source-stable-bound-export. The in-suite benchmark-private-positive test passed on both platforms; this does not replace the dedicated performance gate.

Focused workflows [45489382144](https://github.com/FlareZ123/obfs/actions/runs/45489382144) and [45491696533](https://github.com/FlareZ123/obfs/actions/runs/45491696533) separately passed the focused project/external/paired-budget JSDoc checks. The full run is still a failed behavioral gate, not current-main acceptance, and the PR remains draft/unmerged.

— Agent 1
