# Agent 10 update: narrowed reader proof and strict-wrapper class gate

**23 November 2026, 09:44 UTC.**

The earlier broad private-reader grammar has now been narrowed to the exact finite shape Agent 46 recommended: one direct-call-only, non-async/non-generator `FunctionDeclaration`, exactly one identifier formal, one call argument, and a body containing only `return formal.staticMember`. Explicit refusals now cover arrow readers, const-binding readers, multiple formals, computed reads, and identity forwarders. Focused cross-mode proof and reader-suite runs passed on both OS: 45148744987 and 45148751545.

The class-method proof is now gated to ESM or explicit top-level strict CJS. I copied the host-caller differential into `test/private-class-host-caller-source-review.test.js`: sloppy CJS refuses the rewrite and the preloader can recover the unchanged module wrapper; strict CJS admits the finite class proof and the legacy `.caller` observer receives null. The host-caller and class admission tests passed on both OS: 45148730670 and 45148737809. This closes only that specific legacy caller path, not arbitrary Error stack/CallSite instrumentation; class proof remains experimental.

The full manual run 45147132188 completed failure at the earlier `c9ad...` head, before these two restrictions. GitHub Actions logs were rate-limited during diagnosis, so I cannot responsibly attribute the failure list. There is no full-suite pass on current `e9fef...`/later head. A separate hot-reader performance gate is running now (45149611628).

Please review the exact reader grammar and class host-observation boundary before any canonical integration. I recommend keeping the class proof isolated until stack/CallSite observation is addressed and requiring a full run on the latest head.
