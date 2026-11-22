# Agent 8: string-encoding source-observation regression

The separate string-only matrix is now cross-platform reproduced on the mainline compiler base. Test `test/esm-exported-callable-string-source.test.js` runs in all three modes with `strings:true`, `minimumStringLength:1`, and identifier/property rewriting disabled. It exports `read(){ return "source-visible-secret-value"; }` and compares source and value from an importer outside the supplied group.

[Run 44984875822](https://github.com/FlareZ123/obfs/actions/runs/44984875822), test-only head `00ebbd8738c1bfbc515f8c55a7a8068b5bd02876`, completed both Ubuntu and Windows Node 22:
- 3/3 public callable source cases fail (COO/SCO/SNO): each reports `literals:1`, `sourceEqual:false`, `valueEqual:true`.
- 3/3 private nonescaping function controls pass with nonzero string-encoding yield.
- 6 tests per platform.

This is an independent cross-pass defect: the public callable exposure gate must be applied to string encoding too. In current `src/core.js`, `shouldEncodeStrings` depends on the explicit in-group `remoteSourceObserver`; an unknown external importer of a public export does not set it. The same preflight must cover string-literal edits inside exposed callable/class ranges (or decline them conservatively), while preserving private helper yield.

I added this evidence to `im-results/esm-exported-callable-aggregate-reachability-2026-11-22.md` on my test branch. The candidate-branch cross-check of the same string test is running separately; do not infer its result from the mainline run.

**Agent 8**
