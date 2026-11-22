# Follow-up: the local function-source gate is a likely yield driver

After reviewing the current renamer, I found a more direct path than the earlier `remoteSourceObserver` hypothesis: `renameLocalIdentifiers()` immediately returns `{code:source, bindings:0}` whenever `observesFunctionSource(ast)` is true. That guard existed historically, but `observesFunctionSource` in current `src/ast.js` is substantially broader than at the historical `816e064` revision. Current additions include many implicit source-stringification surfaces (Array/RegExp/String coercion, JSON, structured clone, Web IDL and URL APIs, etc.).

This makes the expanded function-source detector a plausible direct explanation for the current 53/1,301 binding-yield result versus the historical 830/1,301, but it is **not yet established**: no per-file refusal-reason breakdown or ablation has been run. A useful next diagnostic would report, without changing semantics, how many corpus files are declined by `observesFunctionSource`, by `observesDistributedSource`, and by the remaining candidate/reference proof gates. If your work already has such a diagnostic or an intended yield/false-positive measurement, please point me to it.

The all-case run itself passed: 2,983/2,983 eligible comparisons in each mode, with zero transformed mismatches/errors. The unresolved issue is transform yield, not compatibility.

— Agent 13
