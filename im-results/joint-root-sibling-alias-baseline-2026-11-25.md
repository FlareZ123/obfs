# Joint-root sibling-alias proof: current-main baseline

**Date:** 2026-11-25  
**Status:** Capability comparison with reproducible native/emitted parity; no production-source change.

## Question

Can the cross-file property proof rename an owner's property when two imported aliases of that same owner are used through one private carrier, or when one local reader consumes both aliases?

## Current-main baseline

Two tests were added to test/cross-file-reader-flow.test.js at commit 78f7078ad12ff30aef60f0b2b13183d2cced7975:

1. Import state as left and right; store both aliases in separate private carrier fields; destructure them; use one imported reader and one local reader. Current main produces zero cross-file property rewrites.
2. Import state as left and right; pass both aliases to the same local reader. Current main produces zero cross-file property rewrites.

Focused manual-validation run [45568705106](https://github.com/FlareZ123/obfs/actions/runs/45568705106) passed **55/55** tests on Ubuntu and Windows, with strict project JSDoc, strict external JSDoc, and paired/complete-suite budget JSDoc. The helper compares native and transformed execution, so the zero-edit outcomes are behavior-preserving conservative refusals.

## Donor comparison

The test-only donor branch agent7/shared-reference-cycle-audit-20261125 retains the corresponding positive fixtures in test/cross-file-reader-flow.test.js:

- “sibling imports of one owner can occupy multiple private record slots” expects one property rewrite.
- “one local reader can consume sibling aliases of one imported owner” expects one property rewrite.

Those positive cases passed as part of focused donor run [45566449963](https://github.com/FlareZ123/obfs/actions/runs/45566449963), which passed 75/75 on Ubuntu and Windows plus the same strict JSDoc checks.

The donor's relevant implementation addition is in proveLocalObject: additionalRootNames are grouped into a rootNames set after each binding is proven unique and all aliases are proven to share the same lexical scope. The cross-file proof collects aliases of the same exported owner and passes them together, allowing the private carrier inventory to see both values as roots. Current main lacks this additional-root grouping.

## Interpretation and integration

This is a bounded capability gap, not a semantic-correctness bug in current main: current main refuses the patterns rather than changing behavior. The donor demonstrates additional rename yield while preserving native output for these fixtures.

The donor branch is 744 commits behind current main and also predates later class/source-observer work. Do not cherry-pick it wholesale. If the integration owner wants this capability, isolate the minimal root-grouping change, rebase it onto current main, preserve all current source-observer/reflection gates, and run the exact positive and negative fixtures plus the full unfocused validation workflow. The current-main tests intentionally pin zero edits and can be flipped to one after a successful integration.

This finding does not establish stronger static-deobfuscation resistance, tamper resistance, environment locking, or compliance with the 2.5x compute ceiling. Product release remains RELEASE-BLOCKED.


## Donor proof changes worth isolating

The donor diff is not only a relaxed alias count. Its relevant proof changes are bounded:

- proveLocalObject accepts additionalRootNames, verifies every root name has exactly one binding, and requires all roots to share the same lexical scope.
- The private tuple proof collects a set of exact owner indexes rather than one index. Other slots must remain inert primitive literals. It accepts only exact static-index reads into unique local const aliases or bounded array destructuring; unknown indexes, mutation, reflection and holder escapes still refuse.
- The private record proof collects a set of exact owner-valued own data fields rather than one field. Other fields must remain inert primitive values. It accepts only exact static property reads into unique local const aliases or bounded object destructuring; mutation, reflection and holder escapes still refuse.
- Destructured carrier targets are tracked separately as binding tokens so they are not mistaken for executable owner references.
- cross-properties groups named imports only when they resolve to the same (exporter path, export name), verifies each local alias is unique, then proves the complete alias set once using the primary root plus additionalRootNames. A reader alias without a corresponding owner alias remains a refusal.
- The donor also adds fail-closed checks for query/fragment imports that resolve to a different module URL and for import attributes/assertions on the relevant edge.

This is the candidate scope for an integration review. It still needs a fresh current-main rebase and adversarial review; the passing fixtures do not prove every carrier or alias shape safe.
