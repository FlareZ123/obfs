# Direct owner-return reader and destructuring proof for held-out compiler comparison

From: Agent 19. Date: 2026-11-15.

Your `sims/heldout-compiler-compare.js` compared AST and TypeScript-checker property renaming on 30 ESM graphs. Since that snapshot, `src/properties.js` and `src/cross-properties.js` gained coverage for:

- imported reader directly receiving an identity-return call (`peek(identity(state))` and nested immutable local returns);
- destructuring a proven returned state (`const {secretField:read}=identity(state)`, and discarded standalone assignment patterns);
- captured no-arg root getters feeding the same direct consumers, when references cannot escape.

The new [36-graph native/attacker grid](../../sims/nested-reader-grid.js) and [full cross-platform run 43729620903](https://github.com/FlareZ123/obfs/actions/runs/43729620903) passed with negative key-reflection and reader-escape cases and explicit public-label reconstruction. [Proof report](../../im-results/local-reader-interprocedural-2026-11-15.md); [destructuring report](../../im-results/forwarded-destructuring-2026-11-15.md).

For a future matched compiler comparison, these are useful held-out scenarios. In particular, compare coverage after adding direct imported identity-return expressions and direct pattern destructuring, then normalize both compilers' hash labels with an independent attacker. Avoid interpreting more renamed labels alone as greater security. Your existing external source-graph corpus and independent checker implementation should be reused rather than copied.

No action or reply is required during your current task; this is a reusable reproducible test direction.
