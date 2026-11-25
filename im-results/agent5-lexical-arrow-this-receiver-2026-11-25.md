# Lexical-arrow receiver propagation in ambient-call value analysis

**Status:** intermediate research finding and research-helper prototype only. This is not a production compiler fix, an established security result, or release evidence.

## Exact source and test pins

- Research branch: `agent5/lexical-this-arrow-return-review-20261125`
- Branch commit used by the latest focused validations: `4e7ad335f0d2b0f68bc88d50beda5c2924d0d6b8`
- Helper: `workplace/agent9-ambient-call-bindingid.js`, blob `4bc72229bf8b58e65369eec35ce9283f6f8102f8`
- Agent 5 focused test: `test/agent5-receiver-bound-return-resolution.test.js`, blob `22f32df077eb566e05044d21d97caebe699aea06`
- Agent 6 spread/override test: `test/agent6-member-flow-spread-override.test.js`, blob `b4deb6e14a5d20c1757649ffc17e7a06ea243687`
- Agent 10 member-flow test: `test/agent10-member-flow-followup.test.js`, blob `6d27f0eb5641122b57a8e98b2be0cbb45c6fae45`
- Tests run the ambient-call summary and, for the Agent 5 cases, compare it with values actually received by a host callback in Node's VM.

## Red-first evidence

1. Initial lexical-arrow case at branch commit `962782d9eefd3ab7a4f2b0cd8a7f3aeb69e8ba25`, [run 45639455831](https://github.com/FlareZ123/obfs/actions/runs/45639455831): **32/33** focused tests passed on each OS. The failing case was an object-literal getter invoking a local arrow that returns `this.callback`. Runtime delivered the original hidden function, but the summary incorrectly reported `hostHeldCallable === false`.
2. Added local-alias and object-container red-first cases at `157428b5c158fdfd90113267ef3478dc45db4011`, [run 45640476621](https://github.com/FlareZ123/obfs/actions/runs/45640476621): the three new assertions failed on both Ubuntu and Windows:
   - `const value=read(); return value`;
   - `const value=read(); external(value)`;
   - `return {callback:read()}`.
   In each case, the runtime value exposed the original callable, while receiver-aware summary propagation lost the lexical receiver through an alias or container.

## Receiver-flow repair and validation

The helper already builds a fixed-point `receiverExpressionsByFunction` map from statically known method/getter call and property-read sites, and propagates those receivers into nested arrow functions. The missing step was using that map when a sink expression was a call/alias/container whose syntax did not itself contain a `ThisExpression`.

The research branch now extends `callableNodesForValueWithReceiver` to:

- resolve a called arrow function under its statically known lexical receiver;
- recurse through nested arrow invocations while guarding recursive function targets;
- follow local binding initializers, assigned values, and local-record fields;
- recurse through object/array values, conditional/logical branches, sequence and assignment expressions, chains, spread values, and await expressions;
- retain the existing non-receiver-aware path when no lexical receiver proof exists.

The negative controls are important: a bare ordinary function call does **not** inherit the enclosing getter's receiver, and an arrow nested inside that ordinary function retains the ordinary function's dynamic `this` rather than receiving the outer getter's receiver. Primitive `this.count` controls remain unheld.

The focused matrix also exercises the repository's existing narrow local call-parameter value mapping: an arrow capturing the getter receiver survives invocation through one and two layers of local ordinary-function parameter forwarding. A normal function passed through the same parameter path does not borrow the getter receiver. This does not establish arbitrary call-graph or cross-module parameter flow.

### Validation receipts

At branch commit `4e7ad335f0d2b0f68bc88d50beda5c2924d0d6b8`:

- [Agent 5 receiver-flow suite, run 45641775217](https://github.com/FlareZ123/obfs/actions/runs/45641775217): **48/48** tests on Ubuntu and **48/48** on Windows.
- [Agent 6 spread/override suite, run 45642123054](https://github.com/FlareZ123/obfs/actions/runs/45642123054): **19/19** tests on Ubuntu and **19/19** on Windows.
- [Agent 10 member-flow follow-up suite, run 45642336312](https://github.com/FlareZ123/obfs/actions/runs/45642336312): **30 passed, 0 failed, 1 documented TODO** on each OS. The TODO is the private-object proof through a known local mutator parameter; it remains unproven.

All three focused runs passed `npm run typecheck`, `npm run typecheck:external`, and `tsc -p jsconfig.paired-budget.json` on both platforms. The focused workflow skipped its unfocused `node22` job. The earlier 45-case Agent 5 checkpoint passed at [run 45641341707](https://github.com/FlareZ123/obfs/actions/runs/45641341707).

The cross-suite receipts provide evidence that the receiver changes did not regress the tested spread/override, dynamic-key, reflection, descriptor, Proxy, direct-eval, shared-reference, local identity/wrapper parameter, or mutable-factory cases. They do not close Agent 10's TODO or prove those dimensions generally.

## Scope and limitations

- The helper is research-only under `workplace/`; no production `src/` or `bin/` files changed.
- The fixed-point receiver map depends on statically recognized local call/property-read sites. It does not prove arbitrary receiver aliasing, external factories, cross-module receiver flow, or dynamic dispatch.
- Proxies, descriptor-created accessors, `Object.create` factories, prototype mutation, all `super`/nested-closure combinations, returned accessor objects, and reflection remain incompletely modeled.
- Parameter propagation is limited to the existing direct local-call mapping; rest/destructuring, `arguments`, eval/with, arbitrary callback registration, and cross-file call graphs remain unproven.
- The 48-case suite plus the two donor suites are focused semantic evidence, not the full ambient-call suite, browser differential, production emitted-code acceptance, source-observation runtime proof, anti-reconstruction result, or a measurement of the global 2.5× compute budget.
- A green focused helper suite does not establish the release criteria. The repository's strong-protection release remains blocked.

## Next validation

1. Independently review the receiver-map fixed point and alias/container recursion for both false negatives and over-retention.
2. Add red-first tests for returned accessor objects, descriptor/proxy cases, and cross-module receiver flow.
3. Compare the Agent 5 receiver-aware helper with Agent 6's spread/override and Agent 10's member-flow implementations; prefer one canonical receiver abstraction instead of parallel implementations.
4. Run the full ambient-call and source-observation/runtime suites on both platforms before any production proposal. Do not promote this result to `results/` or describe it as a security improvement without compiler-level evidence.
