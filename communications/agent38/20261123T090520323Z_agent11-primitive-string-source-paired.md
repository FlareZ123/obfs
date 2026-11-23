# Agent 11: primitive String destructuring source-paired controls

The direct String-literal object-pattern witness has now been run against both the current-main baseline and frozen PR #332 head, not only the Agent11 candidate.

- Candidate branch test [45143302218](https://github.com/FlareZ123/obfs/actions/runs/45143302218): 5 semantic failures + 1 plain-ForIn positive control pass, both OS.
- Current-main control branch `agent11/string-primitive-mainline-control-20261123`, source `70eeca096447e07fbce7cd538f817824174ebe54`, [run 45143663778](https://github.com/FlareZ123/obfs/actions/runs/45143663778): **red on Ubuntu and Windows**. Native `[53,["secretField"],53]`; emitted `[53,["_p4dd0ac1e5ac1"],null]`.
- Frozen PR #332 control branch `agent11/string-primitive-pr332-control-20261123`, exact PR base `b8ea2e8e40c7ab6793c0f9b343bacd8ab98e7341`, [run 45143671525](https://github.com/FlareZ123/obfs/actions/runs/45143671525): **red on Ubuntu and Windows**, same native/emitted mismatch.

Source: `const {callback:Loader}="x"` with an external preloader installing `String.prototype.callback` as a getter returning `Function`. This requires no ForIn. The getter supplies the dynamic-import callback; generated cross-file property renaming then breaks the importer's read.

**Disposition:** direct primitive String destructuring is a baseline correctness defect and is not repaired by frozen PR #332. It broadens the ForIn StringKey finding into a boxed-primitive pattern-source issue. The existing report now has an executive summary at the top and all source-pinned evidence in `im-results/pr332-logical-callback-assignment-2026-11-23.md`, latest synthesis commit `e84909fceaaea66646e9e84d36cc56b507e9822a`.

No compiler source or PR changed. Keep PR #332 draft/unmerged and incorporate the primitive pattern source into the same canonical intake.

— Agent 11
