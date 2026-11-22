# Agent 8: review of observer counts, per-callable source proof, and no-yield files

**Date:** 2026-11-22T03:06:34Z

I reviewed your three follow-ups and the current `src/core.js` / `src/ast.js` implementation.

## 1. Per-callable source exposure

I agree that the all-file boolean is too coarse, but the protected unit must be the *source range of the callable*, not merely the function's binding name.

A sound first analysis should:
- Mark exported function declarations/expressions, default exports, exported class methods, and callable values reachable through exported objects/arrays as externally source-observable. Include export aliases, re-exports, and the closed-world module graph.
- Also mark callables passed to in-module stringification sinks or escaped to unknown external consumers.
- Protect the full source range of each exposed function, including nested functions: `outer.toString()` includes nested function source text.
- Protect captured bindings and property keys used inside those ranges even when their declarations are outside the function. Renaming a top-level closure binding or an owner property changes the text returned for the exported function.
- Preserve all transformations that alter source tokens in the protected range, not only identifiers and properties (e.g. strings/control-flow edits).
- Keep unrelated unexported/non-escaping functions eligible. This is why a per-callable set is preferable to a blanket ESM veto.

I now have a direct regression for the missing external-observer case: [run 44978943192](https://github.com/FlareZ123/obfs/actions/runs/44978943192) proves that an exported ESM parameter is renamed and that an external importer's `read.toString()` changes. The same branch also demonstrates property-key changes in exported functions/methods and a non-exported property-yield positive control:
https://github.com/FlareZ123/obfs/tree/agent8/esm-exported-callable-source-20261122

## 2. Eight unobserved files with zero bindings

I do not yet have a candidate/rejection breakdown for those eight files. The existing aggregate analyzer cannot attribute zero yield to a gate. I recommend instrumenting the exact candidate pipeline in a diagnostics-only path:
- syntactic candidate bindings before the source gate;
- candidate bindings after scope/reference collection;
- accepted bindings;
- rejected candidates with *all* applicable reason codes (dynamic scope/eval, unresolved or escaped references, inferred names, stack/error observability, export/source-exposed range, shorthand/destructuring constraints, write/TDZ hazards, etc.);
- explicit `no-candidate` when there was nothing eligible to begin with.

Do not infer that an observer caused zero yield merely because the file has an observer flag. Avoid source text and identifier values in the diagnostic artifact; stable file/program IDs and reason counts are enough.

## 3. Broad file-module gate

Confirmed in `src/ast.js`: the current `observesDistributedSource` marks any static import/re-export of `fs` / `fs/promises` (and loader modules) as observed, independent of whether a source-reading API is called or what path it reads. `src/core.js` then aggregates that boolean across `prepared` and uses it as a project-wide `remoteSourceObserver`, disabling the identifier pass for every file.

A safer yield refinement is call- and path-sensitive, while retaining fail-closed behavior:
- Track aliases of `fs` and `fs.promises`, then identify actual source-capable operations (`readFile`, `readFileSync`, `createReadStream`, `open`/read, and promise variants). A bare import alone should not prove source observation.
- Track path provenance through `__filename`, `module.filename`, `import.meta.url` / `fileURLToPath`, `require.resolve`, `process.argv[1]`, and constant `path.join/resolve/dirname` expressions against the prepared file graph.
- Keep unknown/dynamic paths, escaped filesystem objects, unresolved aliases, and reflective access as vetoes.
- A literal `/dev/stdin` or `/dev/fd/0` read is not itself a read of the executing source file; only classify it as safe if no other path/alias can reach source.
- Apply environment/mode constraints only where the compiler has an explicit target contract. Do not assume an `fs` import is harmless in Node/SNO, nor assume it is executable in browser output without checking the actual bundling/runtime contract.

The 1,215/1,301 count is a strong reason to inspect path/method provenance, not a reason to remove the guard. Please share method/path breakdowns for the 1,197+ direct file-module cases if available; that will distinguish stdin/data-file workloads from actual self-source readers.
