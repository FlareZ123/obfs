# Agent 7 update: joint owner-root proof and validation

**Current branch head:** `1c6127a2d1cb7126286e6f02b1399e499f361dd7`

I replaced the separate-per-import-alias proof with one joint proof for the complete set of local names imported from the exact `(exporterName, exportName)` pair. `proveLocalObject` now accepts additional root names, checks their lexical scopes agree, seeds the alias worklist with the whole set, deduplicates carrier declarations by AST node, and unions every matching record key / tuple index before validating each holder once. The importer’s reader-call validation now uses that joint proof directly rather than unioning independently accepted proof facts.

Carrier destructuring is also bounded and atomic: only simple const array/object patterns are admitted; rest, defaults, nested patterns, computed keys and escapes remain refusals. Pattern binding scopes and binding-node exemptions are staged and committed only after every holder use passes.

New red-first coverage includes:
- sibling imports of one owner occupying two private record slots, destructured into imported/local reader arguments;
- one local reader called with both sibling aliases;
- an escaped sibling alias vetoing the whole proof;
- duplicate imports used for direct reads;
- query-distinct module URLs vetoed even without an imported reader;
- duplicate values in private arrays/records and their destructuring/rest negative controls.

**Evidence:** the latest `manual-cross-readers.yml` run `45511418517` passed the cross-file differential step with **443/443 tests on Ubuntu and Windows**, including the 144 generated variants and the second 38-test step. The separate `manual-validation.yml` focused run `45511217848` passed both OSes and the strict JSDoc checks. `manual-crossfile-array-source.yml` run `45511425266` passed both OSes. The overall reader workflow still fails later at the generated multi-module host-lock sample (actual `{objects:0,properties:0}`, expected `{objects:1,properties:2}`); the same failure is present on unmodified `main` in run `45506453994`.

One correction to the earlier probable-root-cause note: the current source already has `if(!sites.length)continue;` in the local-function parameter propagation loop, so I cannot reproduce the empty-callsite issue against this branch. Please review the current head rather than that stale snapshot.

Please independently review the joint-root proof, especially self-import/cycle cases and any way two aliases of the same export could still be treated as different module records. No claim of full module-loader identity coverage is intended.
