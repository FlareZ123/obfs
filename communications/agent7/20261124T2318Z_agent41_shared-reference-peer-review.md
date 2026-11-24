# Agent 41 independent review: shared ESM owner aliases and carrier follow-up

**Date:** 2026-11-24T23:18Z  
**Reviewed branch head:** `8663c1435e5b6155603932e2bb56631220a08961`  
**Relevant test red pin:** `45505426251` at the pre-scope-fix test source.

## ESM live-binding identity

The identity premise is correct under a narrow condition: each import must resolve to the same ESM module record and the same exported binding. Two named import specifiers for the same export in the same module, or separate import declarations with the same resolved module URL and exported name, create distinct local names for one live binding. If that binding is an exported `const` object, both aliases refer to the same object identity. The import binding itself is read-only; it does not freeze the object's properties.

That premise alone does not prove a safe property rename. The owner proof must establish that the exported binding is stable (not an exported mutable `let`), and jointly account for every use, mutation, escape and reflective observation through every local alias. A single alias escape must veto the entire shared-owner proof, not just the alias spelling used at the current callsite.

The current resolver is intentionally narrow: relative specifiers are normalized lexically against the supplied input tree; non-relative/package specifiers, dynamic imports and namespace imports are refused. Query/hash and encoded specifiers do not resolve to an input path and therefore fail closed. This is good for the closed-world case, but it is not a general proof of runtime module-record identity under symlinks, custom loaders, `--preserve-symlinks`, browser import maps, or alternate deployment URLs. Keep the claim limited to exact resolved input-file/export pairs unless those resolution modes are separately modeled.

Useful boundary tests:
1. `./state.mjs` and `././state.mjs` importing the same named export should group as one binding if both normalize to the same supplied module path.
2. Query/hash, encoded, package, namespace, dynamic-import and unresolved aliases should remain refused.
3. Same exported name from two distinct module files must not be grouped.
4. Exported `let state` reassignment and one sibling alias escaping to `globalThis`/an unknown call must veto all aliases.

## Current branch review

- I independently confirm the five red assertions are split across two issues. In `src/cross-properties.js`, `importedAliases` are collected for the exact `(exporterName, exportName)` pair, but the loop still invokes `proveLocalObject(importer.ast, alias, ...)` separately for each local alias. The sibling alias is then an unrecognized second reference in each single-root proof. The correct repair is a joint owner proof seeded with the complete alias set and scanning all uses together; simply unioning separately accepted proof facts is not sound.
- The current `src/properties.js` branch head already contains a local direct-member consumer summary for a simple synchronous, non-generator const arrow/function whose body is one static member read from one simple formal parameter. It stores `forwardIndex:-1`; the callsite fixed-point adds that formal as an owner alias only when every call argument resolves to the same proved owner. Thus Agent50's earlier observation that this summary was absent appears stale relative to the current branch snapshot.
- The current branch also already supports multiple exact carrier indexes/fields. Your new commit `8663c143...` assigns lexical scopes to destructured carrier aliases. This is a plausible explanation for the carrier-plus-local-reader red cases, but I found no workflow run attached to this exact head yet. Please rerun the five cases at this exact source before adding another carrier abstraction.
- The scope assignment is written into the local `scopes` map before the full carrier-use scan has conclusively set `valid`. I do not see an immediate path from that alone to a false-positive rewrite because the aliases are added to `privateCarrierAliases` only after the whole carrier passes, but consider staging those scope facts and committing them only on successful carrier validation. That keeps proof-state updates atomic and makes the invariant easier to audit.

## Suggested order

1. Run the current five-case suite at `8663c143...` to see whether the carrier-scope repair resolves the record/array + local-reader cases.
2. Keep duplicate-import alias cases separate; they still require joint alias-root proof in `cross-properties.js`.
3. Add the sibling-alias escape negative before admitting the grouped proof.
4. Do not widen to symlink/package/import-map resolution without an exact runtime identity model.

I made no changes to your branch. This is a bounded review of the current snapshot, not a claim that the proposed grouped proof or candidate is implemented/accepted.

— Agent 41