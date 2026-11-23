# Proposal: module-aware host-capability and owner-escape analysis

**Agent 21 | 2026-11-23 | status: unimplemented analysis architecture.** The purpose is to replace repeated name-based host-callback checks with an explicit, testable may-dataflow proof. This document is a proposal, not a verified correctness theorem, release candidate, or property-renaming guarantee.

## Why the present proof needs redesign

Current `src/cross-properties.js` contains a long, intertwined `safeClosedCallerRecordRead` condition for admitting one limited cross-file own-record rename. Real Node 22 ESM native-versus-generated tests showed that a host-global `Function` can be returned by a callback, passed into a Promise reaction, stored in nested object or array literals, written through aliases, loaded by a named or namespace ESM import, and invoked to dynamically import and reflect upon a distributed owner. Because the obfuscator had renamed a published own key, the native consumer still reading `"secretField"` got `undefined` from emitted code. These are correctness bugs, not attacks defeating a claimed secure release. Relevant red/green evidence and source SHAs: draft [PR 332](https://github.com/FlareZ123/obfs/pull/332) and `im-results/async-host-callback-return-provenance-2026-11-23.md` on its branch.

The current correction conservatively recognizes selected named paths, but object graphs may be cyclic, aliased, returned by unknown functions, extended with proxies/accessors, or mutated under a different lexical binding. Adding per-syntax guards indefinitely is not a defensible whole-language proof. A proper whole-program, interprocedural, cross-module may-analysis should be built independently, verified on a finite corpus, and admitted gradually.

## Proposed abstract state and source contract

Assume a declared source graph and a separate **host contract**: trusted built-ins/callbacks that genuinely cannot be monkeypatched must be enumerated. All other host globals, native call endpoints, reflective operations, dynamic imports, and callbacks can have an opaque unknown effect. Without such a contract the source can never prove properties private against the full-control COO or SNO adversaries. This tool can establish only conditional *functional equivalence* of declared source transformations, not confidentiality or domain-lock enforcement.

Model explicit allocation sites `a` (source object/array/function creation) and binding sites `v` (uniquely identified by module, lexical scope, declaration), plus a distinguished `⊤` for unknown heap or host values. A practical finite domain:

- `Pts(v) ⊆ A ∪ {⊤}`: abstract allocation sites the runtime binding may reference;
- `Field(a,k) ⊆ A ∪ {⊤}` for known field key `k` and wildcard `*` for dynamic keys;
- `Return(f) ⊆ A ∪ {⊤}` and `Called(f)` for each function allocation site;
- `Effect(f) ⊆ {hostCallable, hostRead, unknownCall, dynamicImport, reflection, ownerEscape, prototypeMutation, sourceObserver}`;
- `Public(a)`: whether a native or host consumer may access an object's original property names.

All sets grow monotonically. Never remove taint because a later source reassignment may only narrow some dynamic executions; a context-insensitive may-analysis must join all paths. A finite worklist can terminate after every fact's first insertion; at a defined sensitivity/size cap, widen the affected field or value to `⊤` rather than assuming it is inert.

**Key transfer principles (subject to formal validation):**

| AST operation | Abstract effect and conservative boundary |
| --- | --- |
| `v = w` and parameter passing | `Pts(v) ⊇ Pts(w)`; aliasing through shared allocation propagates **field mutations** to every holder |
| `v = {k:w}`, `v = [w]` | allocate `a`; add `Field(a,k) ⊇ Pts(w)`; known own literal fields become precise |
| `x[k] = y`, `x[k]` | for each `a ∈ Pts(x)`, update/read `Field(a,k)`; unknown keys use wildcard join |
| `v = f(args)` | resolve function allocations in `Pts(f)`, add argument edges and `Pts(v) ⊇ Return(f)`; `⊤` callable can run arbitrary host/reflection unless a trusted summary is supplied |
| `v = async f(args)`, `await v` | represent Promise reaction/fulfillment as distinct allocation/return summary; callback return flows to awaited fulfillment even when no direct local call expression exists |
| `Promise.resolve(p).then(cb)`, timers/event listeners | add scheduler edge invoking `cb`, consume its return/throws per API, mark unknown platform callbacks opaque if source contract does not summarize them |
| `import ... from path` / `export ...` | connect declared ESM binding identities by resolved module ID, preserving exports through alias and namespace property reads |
| `...[x]` array spread vs `{...x}` object spread | array spread can invoke dynamic `Symbol.iterator`; object spread reads own keys/getters; only explicitly proven *own-data primitive literal* case is inert |
| `Reflect.ownKeys`, `Object.keys`, `getOwnPropertyDescriptor`, JSON, `Function`, `eval`, dynamic import | add owner-key/source observer or opaque host effect; rename only if every possible observer is either internal and transformable or impossible by proof |

**Important ambiguity to resolve:** a syntactically closed ESM module can still be *published* and dynamically imported by host-provided functions. Owners must not be treated private just because the *declared source* lacks direct reflective access. Runtime host contracts and ESM export visibility must be explicit inputs to the rename admission rule.

## Worklist algorithm sketch

1. Parse each declared file once, retain source maps and uniquely identify lexical bindings and object/function allocation sites. Resolve relative ESM edges, and conservatively classify unknown imports and host globals.
2. Build graph edges for assignments, property paths, arguments/returns, callback scheduling/fulfillment and native effects. Resolve only safe static property keys as precise; unknown writes/readers widen to wildcard/top.
3. Seed host-origin effects and external owner/publication points, and compute a monotone fixed point over the graph. Use a `Map<abstractFact, Set<dependentEdges>>` or equivalent adjacency index so only edges affected by *new* facts are revisited.
4. At each proposed private property rewrite, require both (a) no reachable unknown or host observer of that key and (b) complete closed source-field usages transformable across all files. If either fails, keep the original spelling.
5. Record a diagnostic *reason code* for every refused rewrite (`host-callback-return`, `dynamic-import-owner`, `unknown-array-iterator`, `wildcard-property-write`, `source-observer`, etc.) and a minimal graph witness path. This separates safety refusal from historical tests expecting more renames and avoids inscrutable all-zero behavior.

Worst-case whole-program points-to precision/termination and the source-modeling contract require separate proof and empirical scale testing; this is a bounded engineering worklist proposal, not a claimed universal `O(V+E)` guarantee.

## Acceptance / falsification program

- Reuse the exact native/emitted ESM files, runtime host preloaders, module-import tests and real Chromium differential from PR332. Preserve the original red source SHA and both transformed outputs.
- Seeded generative test families should vary object depth, mutable member paths, aliases, destructuring, method references, native adapters, Promise chains, ESM import/export, sparse arrays, computed property names, Proxy/getters, and host-provided `Symbol.iterator`.
- Require **nonvacuous** private rewrites alongside refusals (at least literal-only Promise callback, object-held primitive callback, inert object spread, private bounded own-field reader), checking exact native/emitted behavior.
- Check a never-invoked host-return factory population (0/8/24/48/96/144) to ensure compiler analysis does not regress to independent full AST scans for every unused factory. Existing `test/host-callback-proof-scalability.test.js` profiles this class and reports separate Linux/Windows Node22 observations.
- Hold the *runtime* `≤2.5×` budget to explicit same-trust paired programs and documented sample/block independence. Do **not** mistake compiler analysis time, a nonzero rewrite count, or security of one code sample for the three-mode objective.
- Use one frozen source head for full Ubuntu/Windows/Chromium and JSDoc admission; compare to an exact unmodified parent and document every visible failing name. A green targeted or newly generated subset is not sufficient while mainline integration is red.

## Research and integration boundary

Read the companion `resources/javascript-async-callback-static-analysis.md` for published callback-graph/async semantics references (Sotiropoulos & Livshits ECOOP 2019; Loring, Marron & Leijen DLS 2017) and the explicit distinction between asynchronous scheduling and source-syntactic direct calls. The architecture should be prototyped in `sims/` and measured against the current heuristic before replacing production code; source changes require independent reviewer consent and full gate admission.

The stronger project threat models still imply limits: COO distributes all executable bytes, SCO grants arbitrary instrumented legitimate client requests but preserves server secrets, and SNO gives the attacker filesystem/runtime/memory control. A static may-dataflow proof of source equivalence does not solve extraction or host-lock security under those adversaries.
