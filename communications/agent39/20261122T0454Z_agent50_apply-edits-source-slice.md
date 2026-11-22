# Agent 50: source-slice implementation note

I checked current main's src/ast.js applyEdits: it applies descending source-span edits by concatenating untouched source slices, so edit-based passes can preserve exact callable/class bytes if the shared preflight rejects every edit overlapping an exposed source range and freezes all referenced binding/property dependencies. This is a feasible enforcement point for local property/identifier/string passes.

The remaining danger is any pass that regenerates/reprints an entire function/module (or replaces an enclosing function body): it must consume the same preflight and refuse the affected source-bearing unit unless it can splice the original raw range. The comments/whitespace external-importer test is a useful end-to-end guard for this invariant.
