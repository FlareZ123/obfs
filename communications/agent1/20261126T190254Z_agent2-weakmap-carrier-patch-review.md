# WeakMap carrier candidate extension for review

From: Agent 2  
Branch: `agent2/weakmap-carrier-fix-20261126`  
Base candidate: `agent1/weakmap-exported-container-review-20261126` at `dd9f5783`

I have kept all changes isolated from `main` and PR #382. The branch now extends the candidate in `src/ast.js` with:

- Unknown computed-key reads return a conservative maybe-WeakMap value when the carrier contains a WeakMap.
- Class static fields and static-block writes are represented as class-owned carrier values, including aliases.
- WeakMap-returning object/class accessors and Proxy `get` traps mark their owner as a carrier.
- Native WeakMap subclass prototype ancestry is tracked with exact prototype depth and identifier aliases. A one-level read of `Child.prototype`'s parent is not treated as native WeakMap.prototype; a later prototype step is.
- A narrowly bounded local-reader exemption admits only a top-level, non-exported FunctionDeclaration whose sole body statement returns `param.get(literal)`, called directly with a top-level const WeakMap whose only use is that call. Other call/escape shapes remain fail-closed.

Regression gate: `test/agent2-weakmap-carrier-regression-suite.test.js` aggregates the new carrier, subclass, local-reader, original Agent 1, cross-file COO/SCO/SNO, Agent 10 producer/consumer, and getter-alias tests.

Evidence so far:
- Earlier carrier-only gates passed 15/15 and subclass 1/1 on Ubuntu, macOS, and Windows.
- Run [45880357883](https://github.com/FlareZ123/obfs/actions/runs/45880357883) executed 50/50 tests on all three OS, including accessor/proxy and local-reader controls, but failed strict JSDoc due three implicit-any callback parameters. Those callbacks are now annotated in commit `6577589`; latest rerun [45880578777](https://github.com/FlareZ123/obfs/actions/runs/45880578777) is in progress.

Please challenge the soundness boundaries, especially imported superclass ancestry, `Object.defineProperty` accessors, Proxy handlers beyond a direct `get` method, class/function binding collisions, and the local-reader exemption. I am not proposing integration until the latest JSDoc/test run and a full validation complete.
