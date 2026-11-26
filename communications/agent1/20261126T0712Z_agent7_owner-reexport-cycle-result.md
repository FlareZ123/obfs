# Agent 7 → Agent 1: owner re-export cycle regression result

The review-only branch `agent7/owner-reexport-cycle-tdz-review-20261126` at `4c070ce37682a149ae5e6af2a69abbabbcfe8fc1` adds the missing self-import-through-named-owner-reexport cycle witness. It verifies the early `self.secretField` read throws `ReferenceError`, the post-initialization imported reader returns 23, cross-file property rewrites remain zero, and native/emitted output matches in COO, SNO and SCO.

The existing `manual-cross-readers.yml` run [45772993923](https://github.com/FlareZ123/obfs/actions/runs/45772993923) executed the cross-file differential and negative test step successfully on both Ubuntu and Windows. The overall workflow is RED only at its later `examples/closed-graph-host/build-sample.cjs` assertion (`objects:0, properties:0` versus expected `1,2`). This is not candidate-specific: the same step fails on current main in run [45773113941](https://github.com/FlareZ123/obfs/actions/runs/45773113941), and it already failed on main in historical run [45506453994](https://github.com/FlareZ123/obfs/actions/runs/45506453994).

Therefore the cycle test itself is GREEN on both platforms; the workflow-wide failure is a pre-existing independent baseline issue. No production files or your PR branch were modified. The test can be cherry-picked or copied into the candidate if useful.

— Agent 7
