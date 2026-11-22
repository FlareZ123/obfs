# SCO relocated free-reference admission: lexical scope regression and positive controls

**Status: intermediate compiler-correctness evidence (22 November 2026).**
**Proposed code pin:** `47b095388d19787293fe38e60e9e1ce9cbd41f7c`, branch `agent40/sco-lexical-free-reference-20261122`.
This work adds a bounded source-admission check to the existing SCO selected-export and audited private-graph partitioner. It does not establish tamper resistance, source secrecy, environment locking or the 2.5× compute contract.

## Falsifiable defect and underlying cause

A selected `async` browser function can directly read a user-injected, unqualified name such as `externalBridge` and then be relocated into the server's Node ESM realm where that name has no binding. A static source scanner that checks only `typeof` nodes or uses a whole-AST name-count inventory misses ordinary reads and falsely reasons that declarations in sibling functions/blocks are in lexical scope.

Agent 36 independently preserved a red-first [three-form selected export/graph witness](https://github.com/FlareZ123/obfs/commit/b67a34cb4e059c1172951413fcabad1400973edb), [CI 45000543068](https://github.com/FlareZ123/obfs/actions/runs/45000543068). This implementation addresses the exact ordinary-read family without reclassifying an unknown global as a stable Node builtin.

## Implementation and proof boundary

- New `src/sco-free-references.js` exposes `firstUnprovedFreeReference`, classifying value-position identifiers, declarations and destructuring patterns. It walks actual lexical ancestor scopes through functions, blocks, catch and loop bindings; an unrelated declaration in the AST cannot prove a reference.
- Selected private exports/helpers consult module-approved server constants and private callable names plus their own formals; audited static ESM modules resolve their own imports/declarations. Unknown unqualified reads yield an explicit `unproved free global` refusal.
- The reviewed common-global set contains standard ECMAScript constructors/primitives plus selected shared Web constructors. Existing dynamic-loader, `typeof`, host-API, realm-state and source-admission checks remain active. Browser/Node equivalence of every allowed global or monkeypatched intrinsic is not established by this syntactic test.
- A direct function literal evaluated only as a `typeof` operand is provably inert, so a free name inside its uncalled body is permitted. An actually invoked closure still declines under the preexisting `typeof` check. Unqualified `arguments` is treated as an ordinary function's implicit lexical binding, including when captured through a nested arrow.
- Some legitimate `var` hoisting and other complicated lexical contexts can be over-refused. The scanner has no whole-program effect, module-loader or dynamic-environment proof. It intentionally relies on the existing SCO subset grammar and stronger parallel checks.

## Source-pinned validation

| Evidence | Pin and result |
| --- | --- |
| Prior ordinary global read | Agent 36 [red test 45000543068](https://github.com/FlareZ123/obfs/actions/runs/45000543068), both platforms |
| Initial prototype | [focused gate 45001948870](https://github.com/FlareZ123/obfs/actions/runs/45001948870), Ubuntu/Windows + strict JSDoc green, 21 lexical cases and selected/audited controls |
| First full SCO graph regression | [gate 45002043911](https://github.com/FlareZ123/obfs/actions/runs/45002043911) red **81/83** on each OS: one inert `typeof` false refusal and one changed error precedence for dynamic loader |
| Fixed candidate | [focused gate 45002241606](https://github.com/FlareZ123/obfs/actions/runs/45002241606) and [SCO graph gate 45002233394](https://github.com/FlareZ123/obfs/actions/runs/45002233394), both OS green, exact `f879f17d65e056f6075194b071a324afbb34bc60` |
| Added implicit `arguments` positive | [focused gate 45002409546](https://github.com/FlareZ123/obfs/actions/runs/45002409546) and [SCO graph gate 45002504263](https://github.com/FlareZ123/obfs/actions/runs/45002504263), both OS green at **`47b095388d19787293fe38e60e9e1ce9cbd41f7c`** |

The newest focused file has **25** source-level lexical cases, plus actual selected-export and audited-graph compiler admission checks. The existing graph job runs **83 Node tests** per OS and the `jsconfig.sco-graph.json` JSDoc gate. The focused workflow runs the new test plus strict project/external JSDoc. No full `npm test`, complete Chromium check or universal runtime-cost profile was executed at the pinned candidate. Compiler preflight adds static work; no new obfuscated runtime instruction was introduced by the change.

## Next decisions

1. Review the explicit shared global set and formal lexical scope rules against a separate static analyzer, with particular attention to shadowed imports, `arguments`, default parameters, `var` hoisting, computed binding patterns and function-evaluation reachability.
2. Integrate into a single canonical source-observation branch after Agent 36 and existing source-compatibility owners reconcile their implementations. Preserve the negative cases together with the exact positive controls, and ensure distinct preexisting diagnostics remain stable.
3. Freeze one combined source pin for full Linux/Windows/Chromium native-versus-published parity and strict JSDoc. Maintain separate static extraction, dynamic tampering, runtime admission and strict 2.5× cost decisions. The overall research release remains **RELEASE-BLOCKED**.
