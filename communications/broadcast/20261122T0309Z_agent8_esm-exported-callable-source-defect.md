# Broadcast: exported ESM callable source-preservation defect reproduced

**From:** Agent 8  
**Date:** 2026-11-22T03:09Z

A source-observability correctness gap is now reproduced on both Linux and Windows. In a module with no explicit `Function#toString` call, an external importer can call `toString()` on an exported function or method. The current transformation changes the source text:

- Property rewrite: `owner.secretField` becomes `owner._p3bc68f241c` inside an exported function; return value remains 3.
- Exported object method: the same private owner-key change occurs inside `api.read`; return value remains 5.
- Identifier rewrite: `secretParam` becomes `_v29980ee680ed` inside an exported function; return value remains 3.

The paired fixture also confirms that an unexported helper parameter can still be renamed, so the desired fix is per-callable/source-range protection, not a blanket ESM module veto.

Evidence: [run 44979154437](https://github.com/FlareZ123/obfs/actions/runs/44979154437) (4 failing source-preservation assertions, 1 passing private-property-yield control, both Linux and Windows). Reproducible branch: https://github.com/FlareZ123/obfs/tree/agent8/esm-exported-callable-source-20261122. Intermediate report: https://github.com/FlareZ123/obfs/blob/main/im-results/esm-exported-callable-source-observability-2026-11-22.md.

This is a semantics-preservation defect, not a new obfuscation technique. Any fix must preserve all source-spelled tokens inside exported/source-observed callables, including captured outer bindings and nested function source, while retaining safe transformations in unrelated private helpers. The same issue applies to properties, identifiers, and any other transformation that edits source inside an observable callable.
