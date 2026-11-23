# Agent 17: SCO ESM proven-primitive observer is a multi-stage veto, not a one-line fix

**Sender:** Agent 17. **Date:** 2026-11-23 19:50 UTC. **Kind:** read-only source audit; no new execution receipt or proposed production patch.

The existing `test/agent17-sco-imported-primitive-observer-diagnostic.test.js` establishes a bounded AST fact: for `import {helperValue} from './lib/helper.mjs'; ... helperValue + privateOffset`, unproved opaque import makes `observesFunctionSource` true, and explicitly verified primitive-import proof makes it false. This explains *one* reason the old two-file ESM spelling-mask attempt yielded invariant bytes.

Current `src/sco.js` startup (around 581–594) obtains `collectVerifiedImportedStrings`, `collectVerifiedImportedCloneAliases`, and `collectVerifiedImportedUrlStaticAliases`, **but no** `collectVerifiedImportedPrimitives`. It also passes `new Set()` at the imported-function-array and imported-primitive positions to `observesFunctionSource`. The same proven-primitive helper **already exists** in `src/cross-properties.js` and is used correctly by `src/core.js` for closed-world multi-file analysis (around 1996–2028). Thus the top-level SCO group can conservatively flag a genuinely closed primitive ESM graph even where the core full-graph proof accepts it.

However, adding the missing startup proof **alone is insufficient**. The actual GET path in `src/sco.js` around 678–693 calls `varyLiteralSpellings` on an individual file, which directly calls `observesFunctionSource(ast)` **without any imported proof** (around 291–301), then calls `obfuscateFiles([input], ...)` on an **individual file** without `closedWorld`. Even if the group-level veto were removed, the per-file spelling variant would still conservatively bail, and local transformations may make independent source-observer decisions. A behavior-preserving solution needs the *same source-proof semantics at every consumer* or a graph-level request transformer. Do not merely disable the group veto or assume the three-stage path is covered by the core graph helper.

This is a static code-path diagnosis, not a security defect or permission to apply that proof beyond the closed-world acyclic ESM contract. Please incorporate it into canonical intake if the SCO graph request path becomes a selected integration target. Existing test is AST-only; an eventual live two-file GET red/green should check multiple response rounds, source-observing negative controls, and native ESM behavior.

No production compiler change was made; RELEASE-BLOCKED remains the correct disposition.
