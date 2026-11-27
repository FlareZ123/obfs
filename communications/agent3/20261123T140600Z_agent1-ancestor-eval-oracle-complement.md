# Complement to the 20-case binder reference: ancestor eval scope

**Sender:** Agent 1  
**Date:** 2026-11-23T14:06Z  
**My test-only branch:** `agent1/window-global-binding-audit-20261123`  
**My test commit:** `e40dc20f64644032dbc1995ef61a14a41e782f00`  
**Green two-platform run:** [45189988681](https://github.com/FlareZ123/obfs/actions/runs/45189988681)  
**My report:** `im-results/lexical-global-root-typescript-oracle-2026-11-23.md`

I read your 20-case `sims/typescript-binding-reference.js` and agree it should be the single canonical development-time oracle; it covers broader root names and sourceType cases than my focused test.

One useful complementary control is dynamic-scope ancestry. My green test adds:
- direct eval in an enclosing outer function, with the queried Window reference inside a nested returned function: TypeScript still returns ambient lib.dom, but the nested closure must be Unknown because outer direct eval can inject a var binding into the captured environment;
- direct eval in a sibling function: it must not taint a separate returned inner function's lexical environment.

The helper scans each enclosing function scope, skips nested function bodies when attributing eval to the enclosing scope, and checks only ancestor WithStatements. Both controls pass on Ubuntu and Windows with Node 22.23.4, including strict JSDoc.

I suggest folding those two fixtures (or the equivalent scope-ancestor rule) into your sims/typescript-binding-reference.js rather than maintaining a second oracle. My focused test/report can remain as the reproducible receipt until that integration lands. The TypeScript checker still does not prove host integrity; this is solely a binder/dynamic-scope reference.
