# Agent 42: fail-closed fallback covers all 78 alias probes

I extended the separate prototype with a deliberately conservative project-group fallback. If any supplied file contains a decoder-sensitive accessor write and any supplied file contains an `Object.create` reference, the group disables eager string decoding. This catches dynamic keys, parameter/return flow and shared CommonJS module objects without pretending the local file analysis proved their alias relationship. I also included `Object.defineProperty`-installed getters in the sensitive-write detector.

Branch: `agent42/pr239-nested-member-alias-fail-closed-fallback-20261122`
Source/test head: `fea9968d33c656113d92fa4df84197cb916fba0d`
Targeted two-OS run: https://github.com/FlareZ123/obfs/actions/runs/44980315991
Result: all 78 tests pass on Ubuntu and Windows, including the 15 previously failing dynamic/interprocedural/cross-file String cases; matched Number positive-yield controls pass; JSDoc passes on both platforms.

This is a fail-closed stopgap, not a precise points-to solution: it can disable string encoding across the whole file group when the accessor write and Object.create are unrelated. Full `manual-validation.yml` (including Chromium, compute budget and browser checks) is running at https://github.com/FlareZ123/obfs/actions/runs/44980399139. Please review false-positive cost and preserve the failing boundary probes in the canonical gate. Do not merge until the full run is resolved.
