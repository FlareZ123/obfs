# SCO hoisted-`var` scope traversal: bounded equality audit and scaling pilot

**Classification: intermediate compiler-correctness / build-time performance evidence.**
**Date:** 2026-11-22.
**Base:** draft SCO lexical free-name admission PR #272.
**Optimized stacked draft:** PR #285, branch `agent40/sco-var-hoist-proof-20261122`.
**Source change:** `fd2b6f069f5c326738ccafa9d3c6f0e972cf0ece`.
**Deep-scope unit controls:** `4673c225c3f758094a2f317177f0577fb03b2e83`.
**Reproducer:** `sims/sco-var-hoist-pruned-audit.js`, first published at `afbf1017cee1be8ef4d9877785d4fb4ce42b3f25`.

## Specific bottleneck

The original `firstUnprovedFreeReference::hoistsIn` collected `var` binding names for a function environment by invoking the generic `walk(body)` on its *entire* descendants, then rejecting `VariableDeclaration` nodes whose ancestors crossed another function or class static block. On nested-function ladders, this repeats traversal of all enclosed functions once for every enclosing function. The generic walker also copies its ancestors array for each AST node. This unnecessary analysis cost can be superlinear for valid source even when every nested declaration is out of scope.

The replacement traverses its variable environment using an iterative explicit stack and **does not enter** nested function or class-static-block environments. It collects the same `var` pattern identifiers in ordinary `if`, loops, `try`, `switch`, and nested blocks. Separate lexical-reference checking still applies to computed pattern keys and default expressions. The change modifies compiler preflight work and does not insert protected-runtime instructions.

## Traversal equivalence argument

For an immutable Acorn ESTree tree, the old collector accepts a `var`
declaration exactly when there is no nested function declaration/expression,
arrow, or class static block strictly between the chosen variable-environment
root and that declaration. The new visitor starts from the same root and
descends into precisely the nodes whose paths have not crossed those four
environment boundaries. By the unique-parent path property of parsed ESTree,
every accepted declaration is visited by the new collector, and every visited
`var` declaration also passes the old ancestor test. Both visitors feed the
same declaration patterns into the same binding collector and return a set of
strings. This establishes **algorithmic equality under those tree and root
assumptions**, with the deterministic fixture run as an independent regression
check.

For a chain of `n` nested function bodies, the original visitor may examine
each inner body from each enclosing function, creating triangular repeated
work; the pruned collector visits each nested body only when processing its
own environment. This establishes a better bound for this component, while
the surrounding `walk(root)` still copies ancestor arrays and scans the full
program for actual value references. A total-pass or wall-clock upper bound
requires independent analysis.

## Equality and positive/negative checks

Local Linux Node 22.16.0 with Acorn 8.15.0 executed an independent prior-walker-versus-pruned-walker comparison: **400 deterministically generated parsed programs, seed `0x4f2a1bc0`, 1,659 environment comparisons, zero mismatches**. Each comparison enumerated and sorted the collected `var` names for the program and all nested functions/static blocks. The generator covers nested functions, blocks, loops, `try`, `switch`, class static blocks, and destructured var patterns. The repository test also adds nested depths 32/128/256 with a captured outer variable positive and nested-only declaration negative, checked against the native Node VM.

**Audit limitation:** the independently copied walker comparison is an algorithmic equality screen for this generated grammar subset; it does not prove equivalence for arbitrary ESTree inputs, and it does not validate the complete obfuscator. No latest-commit full GitHub Actions run has been performed. Earlier complete and focused Ubuntu/Windows validations at pre-optimization `eecd05c6c587a13f04bf5725c73edf147e642573` are [45004883858](https://github.com/FlareZ123/obfs/actions/runs/45004883858) and [45004810174](https://github.com/FlareZ123/obfs/actions/runs/45004810174).

## Additional native-realm sensitivity acceptance grid (unvalidated on CI)

Commit `47225f20730dcaafc139084cc7daa51b09221211` adds
`test/sco-var-hoist-native-realm.test.js`: **136 source templates**
(72 safely owned lexical / var cases and 64 deliberately external-name
cases), each invoked twice in fresh strict Node VM realms with the
application global `v` absent or supplied as 73. The test requires the
free-reference preflight to approve owned bindings and reject all cases
whose result relies on the external global, while comparing the observed
native behavior. Cases exercise function-body var, nested closures,
`switch` lexical and var boundaries, class static isolation, inner
parameter defaults, loop lexical bindings, and catch parameters. This is
a submitted **test specification**. Its **native VM portion independently passed all
72 safe and 64 externally sensitive cases locally on Node 22.16.0** (136/136),
without importing the compiler. Actual branch-scanner assertions and the
full repository suite remain pending source-pinned GitHub Actions; native
success alone cannot validate compiler admission. The earlier deterministic 400-fixture
collector equality observation and standalone native spot checks remain
separately described above.

## Local scaling pilot

A *single unpaired timing sample*, excluding parser time, measured the prior and pruned scanners over every function scope of one nested-function ladder. These are local process measurements and **not a stabilized CPU benchmark**:

| Depth | Previous full traversal (ms) | Pruned traversal (ms) |
| ---: | ---: | ---: |
| 80 | 11.912 | 0.030 |
| 160 | 47.943 | 0.054 |
| 320 | 197.634 | 0.105 |
| 640 | 1,251.222 | 0.301 |

The prior visitor workload grows with repeated enclosed subtrees; the pruned version visits no descendants after crossing a nested function boundary. Runtime of arbitrary compile graphs can still have other bottlenecks (parser, AST walker, property proof, filesystem, and server serialization). The above measurements do not establish a whole-compiler speedup.

## Paired local visitor timing replication

A second local Node 22.16.0 / Acorn 8.15.0 run parsed each ladder once,
warmed the prior and subtree-pruned visitors, and alternated execution order
over eight consecutive A/B pairs for each ladder depth. The timing covers
collection over *all* function variable environments of the parsed ladder,
excluding parser time and all other compiler phases.

| Nested functions | Previous visitor median (ms) | Pruned visitor median (ms) |
| ---: | ---: | ---: |
| 80 | 5.838 | 0.133 |
| 160 | 28.884 | 0.049 |
| 320 | 176.111 | 0.095 |
| 640 | 1,303.281 | 0.239 |

All eight raw pairs for each depth and the actual measurement protocol are
preserved in
[`sco-var-hoist-pruned-paired-2026-11-22.json`](sco-var-hoist-pruned-paired-2026-11-22.json).
`sims/sco-var-hoist-pruned-audit.js` now emits the same alternating-pair
method (revision `853a48efb04a6bd80c996b6215afd16bbd8f7b30`).
A single development host and synthetic nested-function source cannot
establish general compiler throughput or the protected-runtime 2.5× contract.
These measurements support the specific repeated-descendant-traversal cost
diagnosis; the full `firstUnprovedFreeReference` checker has additional
walks and scopes whose costs are measured separately.

## Independent switch-discriminant boundary reconciliation

The same branch now carries Agent29's earlier independently tested
switch-discriminant fix. A case-block `let` or `const` does not provide the
lexical binding of the discriminant, which evaluates in the enclosing
environment. The previous scope-only helper falsely admitted an unqualified
discriminant `v` when `case 1: let v=3` appeared later in the source.

A handbuilt AST counterexample against exact pre-fix
`331657d01b74a3622fe79b38b66aab9ddad46329` returned `null` (admitted)
for a scope containing `switch(v){case 1:let v=3;}`. With the corrected
helper at commit `838be1425a9bbb17a30dd99703d8a7da4d4adbc0`, the same
counterexample returned `v` (unproved), while a case-level `var v` remained
proved by function-level hoisting. Native strict Node VM trials independently
confirmed that a missing external `v` rejects and a provided `v=1`
evaluates for `let`, `const`, and class case declarations; the hoisted-var
positive `switch(v){case undefined:var v=3;break;}return v;` evaluated to 3.
The new regression assertions are in
`test/sco-var-hoist-lexical.test.js` at `3805a370be474782fb22654f95e38999880f67ab`.

The mechanism is credited to Agent29's prior source-pinned two-platform
[45009406779](https://github.com/FlareZ123/obfs/actions/runs/45009406779).
The **combined** PR #285 branch has not yet received a full Ubuntu/Windows
validation after these commits, and this targeted reproduction must not be
mistaken for full-compiler approval.

## Research and release boundaries

This is a positive safe-admission and compiler-work improvement. It does **not** demonstrate incremental static deobfuscation resistance, runtime extraction resistance, hostile-integrity protection, authorized-environment locking, or the required universal 2.5× protected-runtime budget. Draft PR #285 intentionally remains stacked on unmerged #272; canonical integration must also preserve Agent29's switch-discriminant lexical-scope correction and related host guards. The primary strong-protection release decision remains **RELEASE-BLOCKED**.

The scope distinction follows ECMA-262 2026 variable-environment semantics and documented `var`/class static initialization block behavior:
- https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/var
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Static_initialization_blocks
