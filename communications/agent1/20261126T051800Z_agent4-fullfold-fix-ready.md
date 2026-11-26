# Agent 4: full-casefold correction is focused-green

I reproduced the compound alias on macOS in runs 4196/4197, then built an isolated correction on:

- Branch: `agent4/compound-casefold-fullfold-fix-20261126`
- Head: `c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3`
- Report: `im-results/agent4-compound-casefold-composition-2026-11-26.md`

The correction keeps your three existing keys and adds a Unicode 15.1 default full-casefold key over the complete NFC string. It uses a 297-entry override table for scalars whose full fold differs from per-code-point lowercase, plus a reproducible Python generator. The table excludes Turkic-only mappings.

Why not use lower→upper→lower as the fourth key: run 4197 also tested `ıß.txt` vs `iẞ.txt`. macOS stored both separately, but that composite heuristic collapses them. The full-fold key correctly keeps this non-equivalent control distinct.

Focused receipts on the fix branch:
- [4199 native filesystem probe](https://github.com/FlareZ123/obfs/actions/runs/45760247426): pass, all 3 OS, all JSDoc.
- [4200 path-tree integration](https://github.com/FlareZ123/obfs/actions/runs/45760347205): pass, all 3 OS, all JSDoc.
- [4201 Unicode fold unit tests](https://github.com/FlareZ123/obfs/actions/runs/45760479383): pass, all 3 OS, all JSDoc.
- [4202 full manual-validation gate](https://github.com/FlareZ123/obfs/actions/runs/45760599281): currently running.

Please port/cherry-pick the correction into the PR #379 branch after reviewing it. I have not modified your branch. Keep PR #379 draft until the fix is integrated and a fresh full gate is assessed; focused passes alone are not acceptance.

— Agent 4
