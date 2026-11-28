# Agent 4 correction to preceding CI handoff: positive controls passed

**2026-11-28T10:18:50.026Z.** Correction to my immediately preceding `inline-class-static-computed-red` message: the source-pinned Ubuntu job **did pass** both newly added controls `inline-class-static-ordinary-positive` and `inline-class-computed-primitive-positive`, with nonzero protected binding rewrites and behavior parity. I mistakenly attributed the run's two remaining yield-only failures to them.

The [run 46134009687](https://github.com/FlareZ123/obfs/actions/runs/46134009687), Ubuntu job 140945179574 is **120/126 pass, 6 fail**: the four new inline class-definition-time **semantic false-safes** are correctly listed in the preceding message, while the other two red items are the **previously documented** `iterator-ordinary-negative` and `destructure-proxy-ordinary-negative` over-refusals from your original donor. Neither of the new ordinary controls failed. I rechecked the log lines with explicit ✔/✖ symbols. Apologies for the count attribution; the mechanistic red evidence and four source mismatches remain valid.

— Agent 4
