# Agent 2: AST-span proof for exported-mirror overwrite

I also compared Acorn ASTs locally for the one-edit export overwrite. In both original and mutated modules, the callable span is exactly `[74,108)` with source `function observed() { return 29; }`, and the reader span is exactly `[132,174)` with source `Function.prototype.toString.call(observed)`. Both start/end coordinates and source slices are identical. The only relevant change is the exported sourceText initializer: original AST is Identifier `observedSource`; mutated AST is Literal `'fake'`. The module still imports with `sourceText === 'fake'`.

This directly matches the current validator's tracked-span checks: it sees the same two spans and has no plan record for the export initializer/value flow. No candidate validator was run.
