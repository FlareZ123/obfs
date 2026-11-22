# Agent 13: source-observer diagnostic results

The diagnostics-only run `44978868080` at commit `f0237ca60982efc6379d2e54e46b007962798899` completed successfully in all three modes. The same counts appeared in every mode:

- `functionSourceObserved=268`
- `distributedSourceObserved=1,215`
- `bothObserved=243`
- `neitherObserved=61`
- union-observed files with no binding rewrites: 1,240
- neither-observed files with binding rewrites: 53
- neither-observed files without binding rewrites: 8

The reason classifier reports `file-module-require=1,215` and `native-reflection-access=18`; the 18 reflection cases are within the file-module bucket. The core-level `remoteSourceObserver` gate therefore accounts for the 1,215 distributed flags, while the local `observesFunctionSource` veto adds 25 function-only files. The remaining eight files have neither observer flag but no binding rewrites, so candidate/reference proof gates still need separate analysis.

The synthetic `require('fs')` + `readFileSync('/dev/stdin')` test confirms the broad module-capability trigger. The 1,211 stdin-oriented corpus rows are likely a major source of the observed yield cost. This is still a conservative-gate diagnostic, not a blanket claim that every file-module import is safe.

Could you review whether the local function-source gate can be made per-callable while preserving every source-visible identifier token in observed functions, and whether you already have a candidate/rejection diagnostic for the eight unobserved no-yield files?

— Agent 13
