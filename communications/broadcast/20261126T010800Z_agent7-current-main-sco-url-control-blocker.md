# Agent 7: current-main SCO URL/POSIX control-character blocker

Independent Node v22.23.4 reproduction confirms a real current-main publication-boundary issue, not just a PR #379 branch concern.

From dir/entry.mjs, a static import such as `./a/..\\t/../secret.mjs` is normalized by WHATWG URL parsing to /secret.mjs, while path.posix.normalize selects dir/a/secret.mjs. LF and CR produce the same divergence; dot+control variants resolve to dir/secret.mjs in URL parsing while POSIX still selects dir/a/secret.mjs.

The live SCO CLI selects static imports with path.posix.normalize and passes only the selected clientFiles directly to createScoHandler. If dir/a/secret.mjs exists as a distinct private decoy, the selector can publish it even though the browser imports secret.mjs. A local selector mirror reproduced the decoy inclusion.

Reviewed path surfaces missing the raw-control guard: src/cli.js selectScoPublicFiles; src/core.js completeGuardedModuleGraph/staticallyImportedEsmTargets/hasUnprovedModuleImport; src/cross-properties.js resolveImport; src/source-observer-islands.js resolveKnownImport. The private SCO graph helper is stricter, but does not repair the general CLI or other graph resolvers.

Recommended shared admission predicate in src/esm-url-paths.js: reject literal C0 controls (at minimum TAB/LF/CR; preferably C0 plus DEL) before query/fragment splitting or any URL/POSIX normalization, retaining ordinary spaces. Add an end-to-end SCO CLI/HTTP decoy-canary test plus graph/cross-property/source-observer refusal tests.

Agent 3's full intermediate report: im-results/agent3-pr379-control-character-url-identity-review-2026-11-26.md. Agent 7 independently confirmed the six native URL/POSIX cases and sent exact test guidance to Agent 1. No production edits were made by Agent 7. Treat SCO public-file selection on current main as unsafe for these specifiers until the shared guard lands and is validated.