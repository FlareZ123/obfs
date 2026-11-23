# Callback-graph and asynchronous-value-flow references for conservative JavaScript property renaming

**Added by Agent 21, 2026-11-23.** This is a literature and engineering-design index, **not** a claim of soundness for the current obfuscator, a new theorem, or evidence of adversarial resistance.

## Established external references

1. Thodoris Sotiropoulos and Benjamin Livshits, *Static Analysis for Asynchronous JavaScript Programs*, ECOOP 2019, DOI [10.4230/LIPIcs.ECOOP.2019.8](https://doi.org/10.4230/LIPIcs.ECOOP.2019.8), [full bibliographic landing page](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ECOOP.2019.8). The authors model data flow between asynchronous callbacks using a callback graph, report sensitivity/precision tradeoffs, and explicitly discuss the implicit nature of async flow. Their published tool and evaluation are not direct correctness certificates for this repository.
2. Matthew C. Loring, Mark Marron and Daan Leijen, *Semantics of Asynchronous JavaScript*, DLS 2017, [Google Research bibliographic page](https://research.google/pubs/semantics-of-asynchronous-javascript/), DOI [10.1145/3133841.3133846](https://doi.org/10.1145/3133841.3133846). The paper provides a formal model of Node.js asynchronous event-loop execution and async contexts, important when reasoning about callback scheduling rather than assuming ordinary synchronous callsites cover effects.
3. Asger Feldthaus and Anders Møller, *Semi-automatic Rename Refactoring for JavaScript*, OOPSLA 2013, DOI [10.1145/2509136.2509520](https://doi.org/10.1145/2509136.2509520), listed in the ECOOP 2019 reference bibliography. A distinct refactoring/callgraph lineage that should be studied for property/identifier rename proof boundaries. **Full article not reviewed here**; no particular result is inferred.
4. [Google Closure Compiler restrictions](https://developers.google.com/closure/compiler/docs/limitations) describe the reliance of aggressive property rewriting on whole-program visibility and conventions. This is tool documentation, not a formal proof for arbitrary host APIs.

## Local failure class motivating this index

A source-visible function returning a host-global callable may not be directly invoked. It can be (a) passed to `Promise.then`, (b) nested in `{callback}` or `[callback]`, (c) mutated into an initially empty object/array field, (d) returned by a wrapper, or (e) forwarded across an ESM import/namespace. Once invoked, the host-provided `Function` may dynamically import and reflect upon a separately transformed module. A compiler recognizing only AST `CallExpression` instances with named local callees will miss some of these channels.

At 23 Nov branch `agent21/async-host-capability-20261123`, the real Node ESM red/green tests in `test/cross-file-async-host-callback.test.js` and the real Chrome script in `test/async-host-callback-browser.test.js` exercise a selected family. Report: `im-results/async-host-callback-return-provenance-2026-11-23.md` **on that branch**. These tests are reproducible counterexamples, not a complete semantic or security proof.

## Architectural proposal: make host-capability reachability explicit

Instead of steadily increasing one monolithic `safeClosedCallerRecordRead` AST walk with name-based special cases, consider a small, independently tested, module-aware **monotone abstract domain**:

- Distinguish a *proven inert primitive/literal tree*, a *known local callable*, a *possibly host-provided opaque callable*, an *object/array carrier of a callable*, and *unknown top*. Unknown must not be silently downgraded to inert.
- Use lexical binding identities plus ESM import/export edges as graph nodes, rather than bare spelling-based identifier sets shared across unrelated scopes or modules.
- Track `const`/assignment, object and array initializers, property writes and reads, destructuring and spread, direct function returns, first-class callable aliases, and known native invocation adapters as graph edges.
- Add callback-scheduling edges for Promise reactions (including value transfer from callback return to awaited fulfillment), timers, microtasks, and higher-order calls. A Promise reaction is not equivalent to a merely syntactic direct invocation.
- Use a worklist fixed point: each newly discovered capability bit causes only incident edges to be revisited. Record unknown-native-call effects explicitly. A graph-friendly design could avoid repeated full AST rescans per factory and provide meaningful compiler-cost data.
- At the specific private owner-field rename decision, refuse if an ambient callable/unknown callback can dynamically import or reflect on the distributed owner under the assumed host contract. Preserve a tested nonzero positive transformation when reachability is excluded by a bounded proof.

**Critical distinction:** Under the project's full-control COO/SNO adversary, any distributed byte or runtime guard remains inspectable/alterable; no static callback proof can establish confidentiality, tamper resistance, or unauthorized-host lock in that stronger threat model. Even semantic parity against a specific host preloader is conditional on the modeled native intrinsics. The graph would improve *source behavior preservation*, not solve strong obfuscation.

## Validation requirements for a prototype

1. Preserve red native-versus-generated ESM output witnesses at the unpatched exact SHA and green them at the corrected SHA on Node 22 Ubuntu+Windows and real Chromium.
2. Preserve at least two **independent nonzero** safe private-field rewrite witnesses (literal Promise callback; object-held numeric callback), plus inert literal spreads; all-zero refusal is not an acceptable regression-proof result.
3. Add a seeded mixed benign/host callback graph corpus with alias/closure/ESM nesting, seed and source snapshots, and independent node/browser differential execution.
4. Report strict program runtime pairs against an equal-trust minification baseline; isolate compiler-analysis performance from the original `<=2.5x` **emitted compute** budget.
5. Seek an integration exact-head full validation and reviewer approval; focused green does not override existing mainline PR322 source-observer positive-yield failures or the RELEASE-BLOCKED strong-protection decision.

This document recommends a research direction rather than asserting that any current heuristic is sound or complete.
