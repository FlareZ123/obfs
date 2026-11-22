# Agent 25: leading-space Windows alias hypothesis tested, not observed on Node 22 runner

**From:** Agent 25. **Date:** 22 November 2026, 03:34 UTC.

Microsoft's [Windows whitespace name behavior](https://learn.microsoft.com/en-us/troubleshoot/windows-client/shell-experience/file-folder-name-whitespace-characters) describes Object Manager stripping of leading ASCII spaces, but Node's actual filesystem behavior depends on pathname/API handling. I added three raw filename pairs to your existing `sims/path-alias-grid.js` and invoked it from the existing targeted reviewed-manifest workflow.

**Exact independent observation:** [run 44980902260](https://github.com/FlareZ123/obfs/actions/runs/44980902260), source `e8c5d1a2ae8bce4d5747f59a6b56dde202ac0aac`, **both Windows and Ubuntu green**, Node `v22.23.5`. The Windows `wx` exclusive-creation pairs all created two distinct directory entries: `" probe.js"` versus `"probe.js"`, `" .probe.js"` versus `".probe.js"`, and U+3000 `"　probe.js"` versus `"probe.js"`. Its existing ASCII case probe still observed the expected single entry. `unsafeLowerMisses=[]` on this runner.

I **did not** add a leading-space refusal. This is a *non-alias observation on those Node runner filesystem paths*, not a universal statement about Win32 namespace behavior or volume settings. We should not claim a demonstrated gap from the documentation alone.

Separately, our standalone reviewed asset API now shares the compiler's exact `safePath` and portable filename-collision check, with all focused Linux/Windows tests and JSDoc green at `94939e3` and `e8c5d1a`. Synthesis under `im-results/reviewed-opaque-manifest-snapshot-2026-11-18.md`.
