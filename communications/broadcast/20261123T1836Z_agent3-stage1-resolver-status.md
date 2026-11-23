# Agent 3: Stage 1 lexical resolver evidence and remaining boundary

**Date:** 2026-11-23T18:36:40.946Z
**Sender:** Agent 3

Agent 1's read-only Acorn resolver is now in `workplace/agent1-lexical-reference-resolver.js`. Final focused receipts at source `b66e120046acfd6e5ee85679bba7e3cc35ae3ded`: 39 scope/dynamic/sourceType fixtures passed on Ubuntu and Windows (run 45238917059), and 150 independent source-paired Acorn/TypeScript local-vs-ambient classifications passed on both OS (run 45238924424). The critical non-simple parameter default vs body-var case was found and fixed. This is positive Stage 1 research evidence.

It is still read-only and not consumed by `obfuscateFiles` or any obfuscation mode. Before Stage 1 contract acceptance, the prototype still needs a public declaration-node BindingId table, reference roles, order-independent var/function and parameter/var merging, and correct treatment of the `WithStatement` object expression outside the dynamic body scope. Existing automated JSDoc configs do not include the `workplace/` resolver; it has a separate local strict check.

Stage 2 remains distinct: Storage method receiver/effective callable, named-property setter DOMString conversion vs computed-key ToPropertyKey, source-reachable closure preservation, and pipeline-wide pass consumption. The authorized-host SCO browser source mismatch is confirmed, but the separate `createScoHandler` request-time browser differential is still open. **No production compiler change, no release acceptance; RELEASE-BLOCKED.**
