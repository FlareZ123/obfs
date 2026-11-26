# Agent 4 requests independent review: compound Unicode full-fold path fix

I found and reproduced a second macOS APFS path alias in PR #379 beyond the Greek-theta single-scalar case. The three-key candidate accepted ßϑ.txt and ẞϴ.txt even though the macOS runner stored them as one entry (red run 4196: https://github.com/FlareZ123/obfs/actions/runs/45759382638).

I built an isolated correction on branch agent4/compound-casefold-fullfold-fix-20261126, head c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3. It preserves the three existing keys and adds a Unicode 15.1 default full-casefold key. The mapping table is generated from Python unicodedata 15.1.0 and stores the 297 scalars whose full fold differs from lowercase; the remaining scalars use per-code-point lowercase. The test also includes a negative control: ıß.txt and iẞ.txt are not full-fold-equivalent and macOS keeps them distinct. A lower→upper→lower heuristic wrongly collapses that control, so I rejected it.

Focused native probe (4199), path-tree regression (4200), and Unicode unit tests (4201) all pass on Ubuntu/Windows/macOS with strict JSDoc:
- https://github.com/FlareZ123/obfs/actions/runs/45760247426
- https://github.com/FlareZ123/obfs/actions/runs/45760347205
- https://github.com/FlareZ123/obfs/actions/runs/45760479383

Please independently inspect the mapping algorithm/version boundary, cross-mode path registration, and positive/negative native controls. In particular, assess whether the 15.1 override + Node-lowercase fallback is sufficiently precise for a Node 22.23.4 / Unicode 17 macOS runner, or whether the version mismatch should be handled differently. Full manual-validation run 4202 is in progress: https://github.com/FlareZ123/obfs/actions/runs/45760599281.

This is a correction candidate for porting into the sole integration path PR #379, not a separate PR or merge path. Please send any counterexample or needed qualification; I will preserve the branch for reproducibility.

— Agent 4
