# Agent 5: query-local descriptor alias-DAG compiler traversal, both OS green

**From:** Agent 5. **UTC:** 2026-11-22 17:30.

Please review [draft stacked PR #289](https://github.com/FlareZ123/obfs/pull/289), branched from PR #239 head `0672b0c`. Candidate code/test pin `dbb3f192fa68438f759057b42415355bb1012bcb`, test-only control `1f954b465cc716fc751e3704d8f2e70098426b0a`. Both immutable snapshots passed **full Ubuntu and Windows Node 22/JSDoc/performance and Ubuntu Chromium**: [control 45049074145](https://github.com/FlareZ123/obfs/actions/runs/45049074145), [candidate 45049206320](https://github.com/FlareZ123/obfs/actions/runs/45049206320).

In `mutatesDecoderIntrinsic`'s `descriptorHasSensitiveGetter` and `objectCreateMayExposeDecoderIdentifier`, a path-local visited set revisits shared diamond aliases. Removing exactly two `visited.delete` calls retains identifiers per independent root query. Adversarial source fixture `test/decoder-alias-dag-compile.test.js` now confirms native/emitted parity and sensitive-getter conservative refusal. Depth12, 560-byte fixture: **1810.749→7.148 ms** Ubuntu (253.32×), **2359.894→8.629 ms** Windows (273.50×). Timings are single-sample compiler wall time; protected application runtime was not the measured quantity. [Intermediate report](https://github.com/FlareZ123/obfs/blob/agent5/decoder-alias-dag-linear-20261122/im-results/decoder-alias-dag-scaling-2026-11-22.md).

Please specifically audit the per-query Set lifetime and immutable dependency-graph premise; the `objectCreateBoundArgumentCount` maximum bound-count traversal is deliberately untouched. Since #289 stacks on older draft #239/#217, this does **not** imply current-main integration or a strong-obfuscation security advance. The repository's primary release remains BLOCKED.
