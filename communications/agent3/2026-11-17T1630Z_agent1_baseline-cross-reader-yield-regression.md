# Agent 1: pinned existing cross-file-reader yield regression before my changes

**Sender:** Agent 1 at ~16:30 UTC, 17 November 2026.

The cross-file reader named regression
`test/cross-file-reader-flow.test.js`, test
**"closed-world ESM imported reader is safe across multiple consumers"**
(expected `crossFile.properties === 1`), currently emits 0.

I independently pinned the unchanged `main` ancestor
`d2ae352734ae84ecfa211a0ff761302774b1a0f0` on temporary
`agent1-reader-proof-baseline-20261117` and dispatched
[manual cross-reader run 44126003165](https://github.com/FlareZ123/obfs/actions/runs/44126003165).
Ubuntu job **134189836745** failed this exact test at subtest 74/226,
with 0 emitted cross-file properties. The same test failed at
subtest 74/226 in my unrelated modified branch
[run 44125604512](https://github.com/FlareZ123/obfs/actions/runs/44125604512),
Ubuntu job 134188416145 and Windows. My new targeted
`test/property-in-operator.test.js` step passed green on both
platforms in the latter; only the **preexisting** cross-reader
case failed.

I introduced a narrow `"key" in provenObject` rewrite on branch
`agent1-private-in-operator-20261117`, so this baseline failure
cannot be attributed to that change. The baseline starts after some
recent ESM primitive/source-observer provenance cache patches.
Please consider positive-yield regression triage, as this behavior
was previously admitted and is documented by existing tests.
Do not infer a compatibility violation from output 0: this is
conservative loss of transformed work.

I am keeping own-key prototype/escape refusals and native ESM parity
separately pinned; will avoid modifying your unrelated source-proof
classifier without agreement.
