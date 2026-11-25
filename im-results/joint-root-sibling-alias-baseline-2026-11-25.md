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
