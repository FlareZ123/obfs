# SCO selective partition: effect-boundary proof direction

**Author:** Agent 7, 2026-11-15. **Status:** design proposal, not an established security or mathematical result.

## The missing semantic model

A mixed ES module runs in one JavaScript realm before selected-SCO partitioning. After the transformation, retained public exports run in the browser and private exports run on the server, communicating through authenticated JSON RPC. Built-in objects, host globals and other mutable state can now be separate. The source transformation cannot infer that such state has been synchronized merely because all function signatures are preserved.

A useful contract is observational equivalence **only for declared JSON-compatible arguments/results and allowed side effects**, under a specified browser/server pair. It must explicitly omit stack traces, identity of function objects, memory addresses and source formatting unless the implementation actually preserves them. If the project requires all ordinary JavaScript observable effects, the current JSON-only split is the wrong architecture for arbitrary programs.

In independent Node VM contexts, the following have directly reproduced differing behavior (see `test/sco-intrinsic-realm.test.js` and `im-results/sco-cross-realm-prototypes-2026-11-15.md`):

- Cross-boundary `Object.prototype` mutation/read, including a reflective constructor lookup.
- A private regex match followed by public `RegExp.$1` (state remains in the private realm).
- Private writes to `Math`, `JSON`, or `Error.stackTraceLimit` followed by public reads.
- A private `window.externalBridge` lookup after movement to Node without an equivalent API.

The current `realmStateObservation` and browser-ambient refusal reject bounded spellings, local aliases, direct mutation shapes and native-method references. They are deliberately conservative, syntactic and incomplete. The focused SCO suite passed on both Windows and Ubuntu at [43772538549](https://github.com/FlareZ123/obfs/actions/runs/43772538549).

## Proposed effect-summary architecture

1. Build a closed-world call graph for the specific module and its approved helpers. At every node, retain provenance (lexical binding, property receiver, whether alias is external/unresolved) and a summary of reads, writes and native calls.
2. Model sensitive environment roots separately: *module-local state*, *built-in prototype/static state*, *host/browser ambient*, *server/process ambient*, *external capability*, and *nondeterministic or time state*. Track origins across parameters, returns, destructuring and assignments. Unknown reflective operations should create an unknown effect rather than silently assuming purity.
3. Compose summaries along calls. For each cross-boundary private/public pair, compare possible read/write sets and dependence on an ambient root whose semantics differ. Reject when consistency cannot be proven or require a caller-owned explicit server contract. The latter is an application assertion, not a compiler proof.
4. Materialize explicit contract evidence at build time (which roots are allowed, which calls may cross, JSON shape, host dependencies, captured aliases). Include a reason string for each refusal and an audit report for accepted partitions.
5. Validate on both semantics and usability: each generated counterexample must be paired with a known-good near-neighbor (e.g. `Math.PI` immutable read, local object property mutation). Use real Node and Chromium runtime tests for admitted programs, record false refusals separately, and retain original-versus-split results for each accepted case.
6. Integrate one end-to-end performance gate: capture the original whole-session workload, count RPC calls, include initialization and transport according to SCO rules, and reject workloads over the prescribed 2.5× runtime budget. A build-time effect scan does not justify a runtime claim.

An effect classifier for all JavaScript native APIs is large. Before treating this as an automatic soundness proof, require independent negative tests for constructor-chain aliases like `({}).constructor`, reflection through assigned methods, host-global wrappers, dynamic computed property names and browser APIs passed through helpers. Several currently bypass syntactic checks. Overly broad bans can also suppress legitimate code; measure admission rate on independent real modules.

## Relationship to security objective

Even a provably behavior-preserving split would not make its authorized RPC interface secret. Under the stated SCO attacker model, unlimited legitimate queries and response interception remain available. Evaluate *source confidentiality*, *oracle learnability*, *authorization/integrity*, *environment enforcement* and *2.5× cost* independently before preferring an architecture. The existing [decision-attack grid](../im-results/decision-attack-grid-2026-11-15.md) includes authenticated finite-domain oracle extraction and SNO filesystem-owner tampering experiments. Conservatively refusing unsupported source semantics only improves compatibility admission, not attack resistance.
