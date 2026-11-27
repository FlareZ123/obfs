# Agent 7 independent answer: import attributes in the SCO graph APIs

Date: 2026-11-26T00:37Z
Reviewed current-main source files: `src/sco-graph.js`, `src/sco-partition.js`, `src/sco-selective-partition.js`, and `src/sco.js`.

## 1. Keep the broad observer refusal in PR #379

I do not recommend an exception for `with {type:"json"}` in this integration.

JSON import attributes do not ordinarily expose raw source text, so a narrower rule may be possible in a future experiment. But the current pipeline's observer decision is group-wide, while the property/decoder proofs are not asset-aware for JSON default imports. An exception would need to prove the exact attribute key/value, target asset type, loader semantics, no competing imports under a different module identity, and that no transform treats the parsed JSON object as an owned JS module object. It would also need tests across COO/SCO/SNO and browser/Node loaders. The current blanket refusal is conservative and correct for this release candidate; its yield cost is not a reason to weaken the proof without that work.

## 2. Separate private graph APIs: no automatic facade/source leak found

### `sco-graph.js`

- `partitionScoAsyncGraph` validates every static import/reexport and literal dynamic import through `verifyPrivateImport`. That validator rejects query, fragment, percent escapes, backslashes, traversal/noncanonical paths and requires a known `.mjs` target.
- It does not inspect `node.attributes`, `node.assertions`, or dynamic-import options. Thus an attributed private import can be admitted as a server-side graph edge.
- This does not put the import into a generated client facade. Each exposed module is passed to `partitionScoAsyncModule(..., {serverOnlyInitialization:true})`; that partitioner skips non-export top-level statements and emits only RPC stubs. An export-from/reexport with a source is rejected by the partitioner. Private modules are not exposed, their source digests are retained, and `createScoGraphHandler` publishes only the compiler-owned `clientFiles`/exact `exposedPaths` through `createScoHandler`.
- Therefore a static/dynamic import attribute does not automatically alter the generated client facade or publish the private module's source bytes. It can change server loader behavior; custom-loader semantics remain untested. An explicitly exposed RPC function can always choose to return data (including a text-import result) to its caller, which is application-level API behavior rather than an automatic source-file route leak.

### `sco-selective-partition.js`

- `collectPrivateStaticImportClosure` does not inspect static import attributes, but it only accepts canonical relative `.mjs` paths and audits the private closure before relocation.
- The main partitioner admits only explicitly listed `privateModuleImports` (or approved Node builtins), and only named `ImportSpecifier` bindings. Default imports (the normal form for text/JSON modules), namespace imports, reexports, and dynamic imports are not admitted by this contract.
- Admitted imports are copied into `serverConstantChunks`, not `publicChunks`. Public function inspection rejects references to `serverConstants`; private helpers/functions are moved into the server-side partition. The final client code is only retained public helpers/functions plus the RPC facade.
- Thus the tested named-import private dependency path does not copy import source or the dependency source into the client facade. A custom loader could still change server-side import semantics, and that should remain an explicit limitation.

## Recommended disposition

No import-attribute source leak or facade mutation was demonstrated in these two separate private-graph APIs. Do not generalize the standard `observesDistributedSource` guarantee to them; describe their separate server-private/facade boundary and custom-loader caveat. Keep the broad source-observer guard in PR #379. If useful, add narrow regression tests for (a) an attributed private import in a graph entry yielding an RPC-only facade with no source canary, and (b) a selective partition with a private attributed named import preserving it only in the server-side source while rejecting any public reference.
