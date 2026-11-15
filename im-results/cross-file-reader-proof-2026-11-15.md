# Closed-world ES-module imported-property reader proof

Date: 2026-11-15. Agent 7. Intermediate implementation and falsification evidence, not a proof of arbitrary-program transformation soundness.

## Prior behavior and new capability

The programmatic `obfuscateFiles(files,{mode:'coo',closedWorld:true})` supports joint property-name changes for a direct named ESM-exported object and its proven importing references. Previously it recognized direct field accesses and some pure identity-return calls. Passing a tracked object to a separately exported function that returned one of its fields caused the proof to decline even if every call was known.

A new conservative `importedConsumers` summary in `src/properties.js` represents a helper accepting an object at a particular argument index **without forwarding the object's identity to the result**. `src/cross-properties.js` admits directly exported synchronous function declarations and immutable exported const arrow/function expressions only when they have ordinary identifier parameters, a sole return of a statically named property from one parameter, an unambiguous exported binding, and no other use of that binding inside its exporting module.

For each importer of a candidate owner object, every imported reader reference must be a direct call with the tracked object at the verified parameter position. Every module that imports a relevant reader must be able to prove the same owner object. Unknown shapes, reflective calls, aliases of the function itself, function-source introspection, namespace imports, dynamic imports, reexports, mutable wrappers, computed dynamic names and partial graph knowledge force refusal. A complete proof rewrites both the exported object's key and the identified direct member expression in the reader body. The transformation is syntactic and does not add an extra runtime dispatch layer.

## Reproducible cross-platform tests

| Workflow / source revision | Experiment | Observed result |
|---|---|---|
| [43689133239](https://github.com/FlareZ123/obfs/actions/runs/43689133239) / `37ca4812` | First three direct cross-module reader cases, before the implementation | All three expected-positive cases failed on both Windows and Ubuntu |
| [43689342706](https://github.com/FlareZ123/obfs/actions/runs/43689342706) / `b7c9f249` | Direct reader implementation plus existing cross-file regressions | Passed on both OS, including strict JSDoc typecheck |
| [43689478401](https://github.com/FlareZ123/obfs/actions/runs/43689478401) / `5903cbe8` | Computed constant keys, more than one reader, identity return into reader, opaque helper invocation, negative shape cases | Passed on both OS, including strict JSDoc typecheck |
| [43689641182](https://github.com/FlareZ123/obfs/actions/runs/43689641182) / `430d802e` | Multi-parameter reader cases before extending argument-position tracking | Two expected-positive cases failed on both OS |
| [43689719465](https://github.com/FlareZ123/obfs/actions/runs/43689719465) / `192c9106` | Argument-position-aware consumer implementation | Passed on both OS, including strict JSDoc typecheck |
| [43689869434](https://github.com/FlareZ123/obfs/actions/runs/43689869434) / `60cf8d9c` | Immutable arrow and function-expression readers before extension | Four expected-positive cases failed on both OS |
| [43689914964](https://github.com/FlareZ123/obfs/actions/runs/43689914964) / `bbcb2f0a` | Immutable reader function implementation | Passed on both OS, including strict JSDoc typecheck |

Detailed native-Node ESM cases live at `test/cross-file-reader-flow.test.js`. A further generated 144-case positive matrix and twelve negative receiver-shape cases are in `test/cross-file-reader-matrix.test.js`; see the manually dispatched `.github/workflows/manual-cross-readers.yml` for current reproducible results.

## Independent reflected-source counterexample

A related but independent unsoundness was exposed in `test/source-introspection-safety.test.js`. Native `Function.prototype.toString` can be obtained through `Reflect.get(Object.getPrototypeOf(()=>{}),'toString')` or `Object.getOwnPropertyDescriptor(...,'toString').value`. Plain AST member-name search for `.toString` misses both paths. With property renaming enabled, a function body containing the renamed key was visibly modified despite being observed as a string.

Native CJS and cross-file ESM cases failed on both platforms in [43690145489](https://github.com/FlareZ123/obfs/actions/runs/43690145489) before the reflection guard; the targeted semantic regression and strict JSDoc checks passed on both platforms in [43690229450](https://github.com/FlareZ123/obfs/actions/runs/43690229450) after `src/ast.js` recognized statically keyed reflection through `Reflect.get` and property-descriptor operations. The guard remains syntactic and cannot prove behavior of arbitrary computed keys or other metaprogramming.

## Claims and limits

The test evidence demonstrates added transformation coverage and preserved native behavior for the explicitly tested cases. It does not establish a general interprocedural alias solver. A caller must opt into `closedWorld:true` while supplying the entire executing ESM graph; external consumers, runtime instrumentation, dynamic imports and arbitrary reflection invalidate that assumption. The original property is still recoverable through execution and can be reconstructed by an attacker who controls the client. Property spelling changes also do not establish a universal 2.5× compute guarantee; profile real workloads before deployment. These improvements prioritize correctness of authorized transformed inputs over aggressive speculative renaming.
