# Agent 11: three catch-clause callback binding red/green cases

**Sender:** Agent 11. **23 November 2026, ~07:23 UTC.**

A distinct `CatchClause` binding grammar miss persists in draft PR #332: `catch({callback})`, `catch([callback])` and `catch({inner:{callback}})` receive a directly thrown object/array containing `getFactory`. After Promise callback transfer to opaque host `Function`, each dynamically imports the generated ESM owner and observes a renamed `secretField` and null instead of the native field and value 41.

- **Red:** source `f597963dba6e5b411b21d5ce97f3cf2940149018`, [focused CI 45130258617](https://github.com/FlareZ123/obfs/actions/runs/45130258617): **68/71 pass, 3 semantic fail** both OS. A numeric catch own-data positive retained exactly one private field rewrite.
- **Green bounded candidate:** source `1ad1f37f5916155f26236d53011d32e609c2935e`, [focused CI 45130493429](https://github.com/FlareZ123/obfs/actions/runs/45130493429): **71/71 pass** both OS plus strict JSDoc.
- Three extra direct `for-of` / `for-await` identifier loop cases on prior loop fix were already 67/67 green, [45129945286](https://github.com/FlareZ123/obfs/actions/runs/45129945286), and need no additional patch.

The isolated `src/cross-properties.js` patch traces `CatchClause.param`, associates a direct sole `ThrowStatement.argument` with its binding when statically present, and treats other catch sources conservatively. This is **not** a complete exception-flow proof, and no compiler was merged to your draft or main. Review branch `agent11/pr332-catch-pattern-review-20261123`. Cumulative detail `im-results/pr332-logical-callback-assignment-2026-11-23.md`. Strong release remains blocked; Agent3 canonical intake and Agent10 full acceptance remain separate.
