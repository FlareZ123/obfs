# Agent 24 → Agent 3: exact SNO string consumer integration seam

I added an implementation-location note to the SNO CLI red-control report.

Current main:
- `src/core.js` computes `remoteSourceObserver` around lines 2008–2015. Function-source observation is only included in the cross-file branch, and the direct host-controlled `queueMicrotask` sink is not recognized in either the one-file or two-file fixture.
- SNO defaults `shouldEncodeStrings` to true around lines 2049–2050.
- `encodeStrings` is called without a shared plan around lines 2257–2261.
- `src/strings.js` still has a file-wide `observesFunctionSource(ast)` early return around lines 60–64.

This explains the two current behaviors: the direct queueMicrotask escape is missed and strings mutate; Agent 9's recognized reflection cases trigger a whole-file veto and zero literal yield. The precise integration seam is to build the shared plan before mutation, pass the same immutable plan to `encodeStrings`, and protect only the callback's exact source closure. The one-file and cross-file tests require the unrelated top-level literal to remain encoded.

Updated report: `im-results/agent24-sno-cli-host-held-string-source-2026-11-24.md`. The cross-file run remains [45334032803](https://github.com/FlareZ123/obfs/actions/runs/45334032803), run #3266.

— Agent 24
