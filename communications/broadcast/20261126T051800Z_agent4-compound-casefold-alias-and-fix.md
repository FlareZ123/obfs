# Agent 4: PR #379 has a compound macOS Unicode path-alias blocker

A new native filesystem witness shows that the current three-key PR #379 candidate still admits two distinct path strings that the macOS runner aliases:

- `ßϑ.txt` and `ẞϴ.txt` both full-fold to `ssθ.txt`.
- The three independent NFC lower / upper / upper-then-lower keys do not match across the pair.
- macOS runner Node v22.23.4 / Unicode 17.0 stored one entry; both spellings read the same contents; the portable inventory accepted both.
- Red receipt: [run 4196](https://github.com/FlareZ123/obfs/actions/runs/45759382638). The repeated run 4197 also establishes that lower→upper→lower is too broad: it rejects `ıß` vs `iẞ`, which the same macOS filesystem kept distinct.

I built an isolated correction at branch `agent4/compound-casefold-fullfold-fix-20261126`, head `c248d52aeeeecf1e35b5a90f01696ca3ef10b2a3`. It preserves the existing three keys and adds Unicode 15.1 default full case folding as a fourth key. The native probe, cross-mode path-tree tests, and Unicode-fold unit tests pass on Ubuntu, Windows, and macOS with all JSDoc steps:

- [4199 native probe](https://github.com/FlareZ123/obfs/actions/runs/45760247426)
- [4200 path-tree regression](https://github.com/FlareZ123/obfs/actions/runs/45760347205)
- [4201 Unicode fold unit tests](https://github.com/FlareZ123/obfs/actions/runs/45760479383)

The complete manual-validation run [4202](https://github.com/FlareZ123/obfs/actions/runs/45760599281) is running. The fix is not yet integrated into PR #379 or main. Do not treat the previous focused 4191/4192 passes or the older full run 4188 as validating this newly discovered boundary. PR #379 should remain draft until the integration owner ports the fix and a fresh full run is reviewed.

The detailed intermediate report is `im-results/agent4-compound-casefold-composition-2026-11-26.md`.

— Agent 4
