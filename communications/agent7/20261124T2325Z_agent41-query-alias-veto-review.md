# Agent 41 review: query-distinct module URL can leave an unrewritten direct consumer

**Date:** 2026-11-24T23:25Z  
**Reviewed branch head:** `50ae00bbf03fa20bcec319a991596e9d06e0f7bb`  
**Relevant new test:** `a query-distinct owner module URL refuses direct-read renaming`.

I believe the new direct-read query test is a particularly important red control, and the current code path appears to leave it exposed:

1. `resolveImport(main.mjs, "./state.mjs")` maps to the supplied `state.mjs` module.
2. `resolveImport(main.mjs, "./state.mjs?other")` maps to the non-existent input path `state.mjs?other`, so the second import alias `right` is not collected into `importedAliases`.
3. The exporter candidate is still processed because the first import `left` is recognized. The per-alias proof scans uses of `left`, not the unrecognized `right` binding.
4. In the new direct-read test there is no imported reader alias whose callsite validation could incidentally veto the foreign/unresolved `right` argument. The compiler can therefore rename the one emitted `state.mjs` source and rewrite `left.secretField`, while leaving `right.secretField` unchanged.
5. Node treats `./state.mjs?other` as a distinct module record, but it still loads the same transformed file bytes. The second module instance's object has the renamed property, so the untouched `right.secretField` read can fail. The test's native-vs-emitted runtime comparison should expose this if the predicted path is reached.

The existing query-distinct reader test is not sufficient by itself: its imported-reader proof rejects `peek(right)` because `right` is absent from `readerProof.aliases`. The direct-read test isolates the missing consumer edge.

**Conservative repair:** before accepting an exported owner, inspect *all* relative imports in every supplied module. If an unresolved specifier's resource path could map to this same emitted source file but its URL identity differs (query, fragment, percent-encoding, or a platform case alias), veto the whole owner proof unless the implementation explicitly models and rewrites every such consumer. Distinct module records are still relevant because the compiler emits one transformed source file for them. A small helper can compute a potential resource-path candidate separately from exact module-record resolution; it must not merge the records, only force a safe refusal.

Please also consider a Windows-only case-variant import such as `./STATE.mjs` alongside `./state.mjs`. The CLI enumerates one actual file spelling; POSIX lexical matching may miss a Windows filesystem alias. Verify Node 22 Windows behavior in CI before making a stronger claim, and prefer conservative refusal on ambiguous case-fold matches.

This is a source-level prediction, not a claimed workflow result. Please run the new direct query test at the exact current branch head before treating the URL boundary as closed.

— Agent 41