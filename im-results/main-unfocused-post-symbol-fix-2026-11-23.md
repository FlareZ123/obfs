# Post-Symbol-attacker repair: unfocused main integration checkpoint

**Agent 7, 23 November 2026. Intermediate source-pinned release evidence;
strong obfuscation and runtime budget remain RELEASE-BLOCKED.**

## Frozen source and status

Unfocused [workflow 45283563363](https://github.com/FlareZ123/obfs/actions/runs/45283563363)
was dispatched from source
`9e614760c75a293a37178fa6e63489d9b904b0ae`, after
[PR #366](https://github.com/FlareZ123/obfs/pull/366) restored the
Symbol-key independent attack harness's supported example result-vector API.
The accepted source also includes the monotonic and validated publication
lock corrections and prior import-map integrity feature.

**Initial checkpoint 23:00 UTC:** Ubuntu's Node 22.23.4 compact behavioral
runner finished 5,336 tests, **5,300 passed / 11 failed / 25 skipped**.
It ran 403,413 ms. Windows was still executing its behavioral test step;
no two-platform final status was established at that point. Future updates
should replace this time-specific observation with the source's actual
Windows/full-workflow conclusion, not infer it from Linux.

## Exact eleven Ubuntu failure names

The observed named cases were:

1. Hostile bound-target interception source, `bound-runtime-interception.test.js`
2. Minified/obfuscated private bound-target source, `bound-runtime-minifier-control.test.js`
3. Private two-file ESM factory positive, `factory-object-flow.test.js`
4. Cross-module named function reader positive, `function-declaration-reader-proof.test.js`
5. Public-only source normalizer clone positive, `function-declaration-reader-proof.test.js`
6. Four-file import and external-API flow positive, `interfile.test.js`
7. COO direct-use private class field yield, `private-class-source-yield.test.js`
8. SNO direct-use private class field yield, `private-class-source-yield.test.js`
9. Complete private tuple cold session field yield, `private-tuple-session.test.js`
10. SNO host-intercepted bound private target, `sno-bound-runtime-interception.test.js`
11. Native metadata-preserved bound public export field yield, `source-stable-bound-export.test.js`

These are **positive rewrite expectations** that returned zero, not
automatically observed native-vs-compiled output differences. They require
case-by-case proof of source observability/owner privacy and a genuine
transformed eligible positive before changing conservative compiler policy.
Agent9's [draft class proof PR #357](https://github.com/FlareZ123/obfs/pull/357)
is a separately tested intervention; the current main receipt does not
include that unmerged branch.

## Change since prior frozen complete main

The earlier [unfocused 45282068819](https://github.com/FlareZ123/obfs/actions/runs/45282068819)
at `e9b1036d52b9c404214fddbecfdb0d6230899473`
executed 5,334 tests per OS with **15 exactly matching failure names** on
both, including four stale Symbol-key attacker fixtures. The Symbol-attacker
test file was then corrected without changing production code in
[PR #366](https://github.com/FlareZ123/obfs/pull/366), and its full
focused test and strict JSDoc passed on both platforms in
[45283118743](https://github.com/FlareZ123/obfs/actions/runs/45283118743)
and postmerge [45283386897](https://github.com/FlareZ123/obfs/actions/runs/45283386897).
The four stale test names are absent from this Ubuntu failing list. Since
the source and corpus changed, this is a same-name disposition and focused
repair, **not** a controlled overall numerical improvement claim.

## Release boundary

No confidentiality advantage over matched minification, robust resistance
to full runtime instrumentation, universal environment-lock enforcement or
2.5× runtime budget was established in this integration. Older source-pinned
negative adversarial and cost counterexamples remain valid for their tested
source and workload. Continue to mark the primary release
**RELEASE-BLOCKED**.
