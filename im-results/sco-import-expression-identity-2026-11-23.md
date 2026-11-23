# Selected SCO imported-function identity through value-preserving expressions (23 November 2026)

**Status:** reproducible compatibility-admission counterexample repaired for the tested syntax. This is an intermediate engineering result, not evidence of general source secrecy, anti-relay protection or universal JavaScript semantic equivalence.

## Tested mismatch and reason

The selected multi-module SCO compiler relocates chosen private ESM function bodies to a trusted shared Node server. A browser-origin original can instantiate the same private dependency independently for each client. A function object imported from that dependency may carry mutable own properties. If the selected caller obtains that function identity through a value-preserving expression, then writes an own field, independently initialized client realms can return `1, 1` where a single shared server instance returns `1, 2`.

The prior `src/sco-selected-graph.js` `assertNoPrivateImportMemberState` veto tracked direct `const alias=imported` and direct `alias.count`; it missed expressions preserving the same object identity. Examples:

```js
const alias = (0, next);
alias.count = (alias.count ?? 0) + 1;
return alias.count;
```

```js
const alias = true ? next : null;
alias.count = (alias.count ?? 0) + 1;
return alias.count;
```

The JavaScript comma expression returns its final operand; conditional and short-circuit expressions can also preserve a selected operand value. See [MDN comma expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Comma_operator) and [MDN conditional expression](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_operator).

The after-fix reproducer creates three actual Node ESM source trees with identical `mixed.mjs` and `private/next.mjs` bytes. Each of two independently loaded client trees returns counter `1`, while two calls into the same server tree return `1` then `2`. This is a *semantic witness* for shared function-object state, not an attacker deobfuscation result.

## Red and green source-pinned observations

- **Original counterexample:** [two-platform run 45131981605](https://github.com/FlareZ123/obfs/actions/runs/45131981605), pinned to `bdee33d13f8263c14767997be57eea238fab6177`, reported two expected-refusal failures and one stateless-call admission pass per operating system. Both function-identity aliases were accepted by the old graph compiler.
- **Intermediate repair:** `ccbed496d082ee3bfa9aac0819320a8ab4033289` added recursive alias propagation for sequence, conditional, logical, await and assignment expressions. Follow-up [red run 45132427048](https://github.com/FlareZ123/obfs/actions/runs/45132427048) found three further accepted sinks: sequence-wrapped private return, nested call argument, and expression-bodied arrow function.
- **Broader sink repair:** `310f135f2ab6c60207c4c336c7d9b2239211ce5f` guards these first-class sinks, including return, arrow body, yield, default parameter, array element, object property, spread, and call/new arguments. The existing selected-SCO state and graph suites and the initial six-case regression each passed their focused [Linux/Windows three-workflow gate](https://github.com/FlareZ123/obfs/actions/runs/45132577206).
- **Real ESM behavior and safe control:** [two-platform focused run 45132788658](https://github.com/FlareZ123/obfs/actions/runs/45132788658) at immutable source `2b57c564763468a7a8e229f9db550a23389e1112` passed **8/8** new regression tests on both Ubuntu and Windows, together with project/external/paired-budget JSDoc static checks. It includes the actual three-tree ESM witness, a harmless `const fn=(0,next);return fn();` admission, and all five refusal tests.

Reproduce from the corresponding exact source pin with `node --test test/sco-selected-graph-expression-alias.test.js`. Use the `manual-validation.yml` focused-test input for Linux/Windows source-pinned CI.

## Subsequent class-field admission probe

A separately source-pinned [two-platform red gate 45133188661](https://github.com/FlareZ123/obfs/actions/runs/45133188661) at `42cd9a3198aee4560d05070847f4314a8fc67df5` returned **two missing-refusal failures per operating system** for imported function identity hidden inside instance and static class field initializers. The eight earlier tests still passed. The new class-field and class-heritage conservative source checks were committed in `178ebc8f7c1eb333b71f6e1f3ed10333f1e2e904`. A real native ESM three-tree class-field counter witness was added separately in `94942884498680da9687b7c3547b9df195d4cd94`. The [source-pinned green gate 45134309969](https://github.com/FlareZ123/obfs/actions/runs/45134309969) at `94942884498680da9687b7c3547b9df195d4cd94` passed **16/16 tests on Ubuntu and 16/16 on Windows**, including the native class-field state witness and all five initial expression-refusal cases, plus strict project/external/paired-budget JSDoc.

Follow-up `4c9a6c3fb35f1741dc472cd78d01384eaab923ba` extends receiver checks to expression-wrapped member accesses, and syntax-level `in` / `for in` / `for of` reflective reads. `test/sco-selected-graph-expression-alias.test.js` now contains source-refusal and safe plain-record controls for these cases. The full 16-case [two-platform focused validation](https://github.com/FlareZ123/obfs/actions/runs/45134309969) covers this added reflection behavior. The graph still relies on narrow syntactic provenance, not complete cross-realm state proof.

## Standalone selective-SCO parity and common guard

The exact same imported-function identity escape also reached the standalone `partitionScoSelectedAsyncExports` entry point. Its original audit lacked the selected graph’s first-class imported-function guard. A source-pinned [two-platform red run 45134873536](https://github.com/FlareZ123/obfs/actions/runs/45134873536) at `cd6d907e5e643def342d6e77f123779163c214d8` reported **three accepted prohibited private-function identity paths per OS** (direct own-field mutation, comma-expression alias mutation, and class-held identity). The safe direct-call control passed on both platforms.

The guard’s complete 4,832-byte implementation was moved byte-identically from `src/sco-selected-graph.js` into `src/sco-private-import-identity.js`, then imported by the graph and standalone compilers. The latter runs this additional check only for declared private relative imports. The graph composer keeps a separate check for transitive private-source modules and relies on the standalone compiler to audit each graph unit, avoiding duplicate root parsing. No emitted protected runtime instructions were added.

The [standalone green run 45135043521](https://github.com/FlareZ123/obfs/actions/runs/45135043521) at immutable `65e6a50d40c4de2308a1b438d25f9be501911952` passed **4/4** tests on each OS, including safe direct calls. At the same source pin, the [existing standalone selective-partition suite 45135048786](https://github.com/FlareZ123/obfs/actions/runs/45135048786) and [existing selected-graph integration suite 45135054113](https://github.com/FlareZ123/obfs/actions/runs/45135054113) passed on both platforms, including all required strict JSDoc checks.

At the later immutable source `8df1da3c7015381ed5561e787592b93c7f71fa29`, the [two-platform standalone green run 45135405528](https://github.com/FlareZ123/obfs/actions/runs/45135405528) passed **6/6** tests per OS, covering both positive controls (a safe sequence alias directly invoked and a primitive-import arithmetic alias), and the source also contained the no-extra-scan optimization `07ed0b476f6dacd2bca94bb27608dd193c385f79` and duplicate-graph-unit-scan removal `143e0ac592d18efd91e87357c94ea17dad12f730`. Project/external/paired-budget JSDoc passed. The paired [graph-focused run 45135411909](https://github.com/FlareZ123/obfs/actions/runs/45135411909) at the same exact `8df1da3c7015381ed5561e787592b93c7f71fa29` passed its focused checks on both Ubuntu and Windows, with strict JSDoc gates.

## Source-preservation comparison

The standalone selective compiler at before-change `4c9a6c3fb35f1741dc472cd78d01384eaab923ba` contained **112,770** UTF-8 JavaScript source bytes. The optimized compiler file at green source `8df1da3c7015381ed5561e787592b93c7f71fa29` contained **113,086** bytes. Removing exactly (1) the new shared-guard `require` line and (2) the new conditional guard comment and call reproduces the original **112,770-byte file exactly**. This source-level comparison establishes that the existing standalone emitter implementation was left unchanged by this repair. It does not measure emitted artifact bytes for every source, compiler initialization cost, network overhead or the universal 2.5× runtime requirement.

## Bounded expression-identity argument

Let `A` be the initially observed set of local names imported by a relative ESM specifier. A name added to `A` by a variable initializer or assignment is treated as a possible alias even if its real lexical scope differs. Define `C(e,A)` by the code's `carriesAlias` visitor. Within the *restricted expression grammar* below, `C` overapproximates expression values that can equal a function-object identity named in `A`:

- An `Identifier` is tracked exactly by spelling membership in `A`.
- A `SequenceExpression` evaluates to the value of its last operand, so only that operand's `C` result matters.
- A conditional expression evaluates one of two alternatives; a logical `&&`, `||`, or `??` expression can evaluate to its left or right operand. Disjunction over the possible value-carrying branches is a conservative overapproximation.
- An `AwaitExpression` or `AssignmentExpression` is conservatively treated as potentially carrying its argument/right-hand value; thenable assimilation and compound assignment can instead produce other values, yielding safe refusals for this check.

By structural induction over that grammar, whenever a permitted expression can produce one of the tracked operand identities directly, `C(e,A)` returns true. The outer fixed-point walk adds named aliases until the finite identifier set stops changing. The second walk refuses supported first-class and reflective sinks consuming `C`-positive expressions. The policy therefore rules out the **tested direct and wrapper-propagated identity carriers** at those sinks.

This is **not** a whole-program noninterference theorem. The source walker tracks names rather than binding-resolved lexical identifiers, so shadowing causes false refusals. An untracked `CallExpression` can return the imported function, a getter can hide an identity, and higher-order export returns or host-provided methods can carry values outside the grammar. This local argument does not establish equivalence for arbitrary JS graphs. It also does not show that a source-refused variant would execute safely if the caller ignored the compiler failure. Future admission work should either extend the provenance proof with audited return summaries and resolved bindings or keep uncertain carriers out of the eligible grammar.

## Implementation and limits

The recursive `carriesAlias` check follows identity-preserving expression results to a fixed point over syntactically named aliases; sink checks reject first-class references whose transfer cannot be proved safe. The graph deliberately may reject harmless uses of primitive imports. A source refusal retains the original application semantics only if the compiler refuses to publish incompatible artifacts.

The guard is a limited syntactic analysis. Unbounded interprocedural higher-order returns, accessors with indirect carriers, arbitrary class metaprogramming, Web APIs, host globals, transitive state and intentionally hostile instrumentation are outside a complete proof. Tests cannot establish that a different supported path never leaks an imported identity. No runtime code is added to admitted compiled applications, but no universal **2.5×** budget measurement follows from this compile-time change. SCO still permits authenticated same-account relaying and should not claim universal client anti-cloning.

This record belongs in `im-results/` under the repository's publication criteria; it is not an established strong-obfuscation result.
