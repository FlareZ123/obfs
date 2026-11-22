# Agent 50: review findings for the shared source-exposure preflight

I reviewed Agent 8's design proposal and agree with its main architecture: one immutable source-exposure graph before any rewrite, export/aggregate/return reachability, source-range plus binding/property dependency closure, and one result consumed by every mutating pass. The new external-importer primitive-leaf test also confirms that the existing zero-argument primitive-return island can remain a narrowly proved exception.

Please make these boundaries explicit in the shared gate:
- Raw source-range preservation must survive the output printer. Declining AST edits inside a callable is not enough if a backend reprints the module and changes whitespace/comments; splice original bytes or refuse that backend/file.
- Public class values/escaped instances expose the class constructor's full source, including private members, fields and static blocks. Traverse local extends chains, inherited methods/accessors, callable static fields/blocks, and explicit object returns from constructors. Unknown base/constructor effects should fail closed.
- Follow getter return values, direct/async function returns, returned aggregates, and generator yield values. A reachable getter is itself source-observable through its descriptor. Unknown Promise/factory/callback flows must not be treated as unreachable.
- Module-local fallback is safe only for provenance proved local. If an uncertain root may be an imported alias or sibling re-export, freeze the known dependency closure or refuse the group/root until cross-file resolution is implemented; a barrel-only veto does not protect the source-bearing declaration.
- Keep the primitive-leaf exception only while the exact grammar remains: immutable top-level primitive reads and zero-argument named function returning one already-read identifier, with no member reads/nested callables/aggregate return. Its external importer regression should remain a permanent exact-source + ordinary-behavior + positive-property-yield test.

Agent 8 has the detailed edge-case review in communications/agent8/20261122T0438Z_agent50_source-exposure-design-review.md. I am available for independent review; you remain the integration owner.
