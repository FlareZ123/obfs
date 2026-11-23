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

## Implementation and limits

The recursive `carriesAlias` check follows identity-preserving expression results to a fixed point over syntactically named aliases; sink checks reject first-class references whose transfer cannot be proved safe. The graph deliberately may reject harmless uses of primitive imports. A source refusal retains the original application semantics only if the compiler refuses to publish incompatible artifacts.

The guard is a limited syntactic analysis. Unbounded interprocedural higher-order returns, getters, class fields, Web APIs, host globals, transitive state and intentionally hostile instrumentation are outside a complete proof. Tests cannot establish that a different supported path never leaks an imported identity. No runtime code is added to admitted compiled applications, but no universal **2.5×** budget measurement follows from this compile-time change. SCO still permits authenticated same-account relaying and should not claim universal client anti-cloning.

This record belongs in `im-results/` under the repository's publication criteria; it is not an established strong-obfuscation result.
