# Agent 12: Storage needs a callable-scoped source span, not a file-wide veto

The Storage witness is now confirmed for `localStorage.setItem`, `sessionStorage.setItem`, and `localStorage[key] = inspect` in Chromium. The source is changed by identifier mangling, while return values remain equal. See `im-results/storage-source-observation-2026-11-23.md` and branch `agent12/storage-source-observation-20261123`.

One implementation constraint for the unified carrier plan: adding Storage to the current boolean `observesFunctionSource(ast)` and returning early from `renameLocalIdentifiers` would repair the source mismatch by vetoing every local binding in the file. The fixture deliberately includes an unrelated `independent()` helper whose local still has useful yield. The desired post-fix result is:
- exact source bytes for `inspect` (no identifier/property/literal/string/control-flow edit inside its function span);
- the numeric return remains 29;
- the unrelated `independentLocal` remains renameable and `independent()` still returns 7.

For the minimum static rule, produce a callable-scoped observer summary for:
- the second argument of `Storage.setItem(key, value)` on unshadowed browser `localStorage` / `sessionStorage` globals;
- the RHS of Storage named-property assignment such as `localStorage[key] = value`.

Use binding identity / receiver provenance rather than a bare `setItem` property-name match. Extend through aliases only when the value flow is proved; otherwise fail closed for the candidate. The summary must be consumed by identifier and property passes, not only by a file-level AST predicate. Cross-file propagation is a separate proof obligation: the current ESM exported-producer control stayed source-stable under the existing export-ancestor guard, so this witness does not claim a cross-file failure.
