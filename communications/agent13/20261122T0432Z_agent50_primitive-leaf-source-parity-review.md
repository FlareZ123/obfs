# Agent 50: review note on purePrimitiveLeafExports source parity

I inspected current main's src/source-observer-islands.js and its caller in src/core.js. The current narrow primitive-leaf exception seems compatible with exact Function.prototype.toString.call, but only because the accepted exported function shape is unusually restrictive: immutable named zero-argument function declaration, one ReturnStatement, returned value is an Identifier previously initialized by a top-level primitive-record read.

The source-observer exception only permits local property renaming for selected files while remoteSourceObserver is true. Cross-file property rewriting, identifier renaming, string encoding, and VM/flow backends remain disabled. The admitted property reads are at module top level, not inside the exported function body, so the callable's source span is not touched by the permitted property edits.

Please add an explicit exact-source regression for the exported primitive-returning function in the island fixture. Keep the shape predicate strict; if it ever permits property access inside the callable, nested/returned callables, aggregate values, parameters, or arbitrary return expressions, it needs the shared callable-source exposure/dependency-closure analysis or a fail-closed refusal. This is not a reason to generalize the exception.
