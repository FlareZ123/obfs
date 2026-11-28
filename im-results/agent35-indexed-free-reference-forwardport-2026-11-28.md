# Indexed free-name admission across SCO's browser→Node relocation boundary

**Date:** 2026-11-28. **Research status:** independently reproduced static-admission counterexample plus bounded source-pinned browser/compiler evidence; **NOT** a whole-obfuscator release claim. Candidate branch: `agent35/sco-indexed-free-proof-forwardport-20261128`, compiler+doc HEAD `8c6d2fbd50284e908e1a45562b7ba693ba8348aa`. Earlier donor `agent35/sco-known-node-ambient-parity-20261123`.

## Threat and invariant

Selected SCO functions are compiled from browser-origin ESM into trusted server-side Node modules. Their original caller may inspect and debug all public client files but not compromise the SCO server. A compile-time decision to relocate an export must not silently resolve a free name against *different* host globals. Native Node exposes `process` and `Buffer` in contexts where vanilla Chromium does not.

Direct syntax is insufficient: the compiler's original `typeof` proof only inspected function literals directly invoked as callee/tag of a syntactic call; it treated other nested callback bodies as inert. However the operand of `typeof` is evaluated first, and native operations can synchronously invoke such callbacks/getters.

Reproducible red-first: `export async function protectedOp(){ return typeof [0].map(()=>process)[0]; }` originally evaluates to `"object"` in Node and throws `ReferenceError` in Chromium. Test-only [46105228786](https://github.com/FlareZ123/obfs/actions/runs/46105228786), exact source `f719dd019782f959c2ad25d286dbaa1d486d2e98`, recorded `Missing expected exception` on Ubuntu and Windows. The narrow `typeof` correction alone passed 19 real Chromium cases and two-OS compiler admission [46106169242](https://github.com/FlareZ123/obfs/actions/runs/46106169242), including an audited static ESM getter. Yet a named callback's function body lies **outside** the `typeof` subtree: `function read(){return process;} return typeof [0].map(read)[0];`. New exact red-first [46106245333](https://github.com/FlareZ123/obfs/actions/runs/46106245333) proves this residual false admission on both OSes.

## Indexed lexical proof and bounded response guard

`src/sco-selective-partition.js` now uses `firstUnprovedUnqualifiedReference(root,moduleBindings,rootFormals,allowServerNodeGlobals=false)` as an indexed lexical ownership proof, rather than assuming the callback body can be statically ignored. It builds scope inventories once per scope for program, function, block, loop, switch, catch and class scopes; handles destructuring and parameter names, function-scoped hoisted `var` separate from parameter defaults, static property keys and declared imports. It checks selected private function outer nodes, helpers and explicitly declared static `privateModuleSources` dependencies. Unknown unqualified `process` or `Buffer` is rejected; a caller who knows that the source originated on the Node server may explicitly set `allowServerNodeGlobals:true` to bypass *only* this Node-only ambient restriction. That option is **not** authorization to migrate arbitrary browser code or an assertion of general realm equivalence.

The earlier generalized donor also included a response API guard for browser relative `Response.redirect("/next")`, which can observe a browser document base absent in Node. The first forward-port Chrome run [46106878397](https://github.com/FlareZ123/obfs/actions/runs/46106878397) was **RED** on this missing companion guard. The source-pinned fix `8c6d2fbd...` reintroduces the conservative `Response` host API refusal while preserving a locally owned literal `const Response=41` positive control. This case is separate from the lexical `process`/`Buffer` proof, and the result should not be attributed to it.

The broad scanner is deliberately **conservative**: some functions and property access patterns that are merely stored, not invoked, may be declined if proving safe lexical and dynamic provenance exceeds this bounded audit. The compiler must not claim universal semantic parity for arbitrary dynamic imports, global effects, source observers, loader aliases or host APIs. In particular, explicit server-only Node source is a different trust contract than relocated browser ESM.

## Source-pinned measurements

| Exact source and run | Scope | Outcome |
|---|---|---|
| `722176bc0a19...` [46106245333](https://github.com/FlareZ123/obfs/actions/runs/46106245333) | Original named callback negative control, two OS | **RED**, compiler incorrectly admitted free `process` |
| `ad2b792625ba...` [46106880860](https://github.com/FlareZ123/obfs/actions/runs/46106880860) | Indexed lexical proof, named callback and safe controls | **GREEN**, both OS |
| `ad2b792625ba...` [46106878397](https://github.com/FlareZ123/obfs/actions/runs/46106878397) | Broader original-host browser differential and `Response` cases | **RED**, missing companion `Response` guard |
| `8c6d2fbd5028...` [46107398481](https://github.com/FlareZ123/obfs/actions/runs/46107398481) | Chrome original ESM vs Node (7 ambient roots × 8 source wrappers = **56** mismatches), compiler decline, explicit safe local and response tests | **GREEN**, Ubuntu and Windows; Ubuntu log: `SCO_NODE_AMBIENT_WRAPPER_MATRIX {"total":56,"mismatched":56,"admitted":[]}` |
| `8c6d2fbd5028...` [46107401799](https://github.com/FlareZ123/obfs/actions/runs/46107401799) | Named callback free-global refusal and positive local bindings | **GREEN**, Ubuntu and Windows |
| `8c6d2fbd5028...` [46108176995](https://github.com/FlareZ123/obfs/actions/runs/46108176995) | Full behavior/JSDoc/budget/native browser run | **pending** at report creation |

The exact native Chrome ambient matrix and encrypted-source relayed code are **not** equivalent to a hostile-client attack-cost comparison; the tests identify a bounded false-admission class. This is an admission safety improvement with **zero added runtime cost for admitted functions**, because the checks occur at compile time, but a full code-level performance comparison is not yet proven. Static reference safety alone does not satisfy tamper-resistance, source confidentiality, hostile SNO runtime protection or universal 2.5× runtime acceptance. The repository release decision remains **NO-GO / RELEASE-BLOCKED**.

## Dependencies, failed approaches, next steps

- Continue using Agent 18's host-effect/response guard work rather than duplicating it. Verify actual constructors in selected source: a global `Function` or `eval` called from selected browser-origin code can rebind to the Node global. **New red-first dynamic-source matrix** is currently on `agent35/sco-dynamic-source-ctor-host-gap-20261128` at `2505cd3b...`; focused CI [46108550315](https://github.com/FlareZ123/obfs/actions/runs/46108550315) pending. Do not assume red before reviewing CI.
- Exact-head full test and corrected SCO authorization must pass before proposing this research branch for integration. If full Windows CPU measurement fails due the current `process.resourceUsage` oracle's nonfinite/nonpositive report, classify it as an oracle failure and use an independently tested `process.cpuUsage().user+system` child CPU microsecond fixture; never skip a failing budget test to obtain green.
- This branch does not address Agent 25's five independent frozen PR #384 native Chrome source-observation reds. Those target a distinct core output-transformer and must stay a release blocker.
