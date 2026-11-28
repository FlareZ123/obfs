# Function call-protocol provenance and observable source: source-pinned audit (interim)

**Status: source-pinned red baseline; repair is experimental and not release-approved.**

## Scope

The Node three-module `Storage.prototype.setItem` / WeakMap-captured callable source fixture in `test/agent3-weakmap-cfg-matrix.test.js` differs from the trivial numerical-output test. An earlier ESM module can mutate the shared WeakMap instance prototype before a sibling exports an otherwise innocent function. A test runner's `document.title=String(value)` host sink captures its exact `Function#toString` source. A binding rename that preserves `inspect() === 29` but changes its emitted function source is a behavioral regression.

The inherited-protocol call form `fill.call(null)` is a `CallExpression` with **MemberExpression callee**. The existing private local-helper replay in `src/ast.js` recognized direct identifier calls, ordinary object methods and named local class constructions, but did not replay this protocol call's formal defaults. `fill.apply(null,[])`, `fill.bind(null)();` (via a retained bound value), and inline class expression constructors similarly require an effect summary. Native JavaScript verifies that all these invocation patterns can synchronously write a WeakMap into a captured outer carrier before the source-observing storage override.

## Independent baseline evidence

- Frozen source for 96-case donor audit: `agent2/formal-param-96case-donor-audit-20261128` commit `09a3ad9d9b7626bb6acb389db21fa6b6942a10ab`, derived from 80-case source donor `2a5a4d30c15f64951df6004ac0bf75bde645e1e6`.
- Focused GitHub Actions run **46132219487**, exact source pin `09a3ad9d`, **FAILED identically on Ubuntu, Windows and macOS**. Five semantic mismatches: `host-call-default`, `host-apply-default`, `host-bound-default`, `direct-class-expression-new-default`, `direct-derived-class-expression-default`; each preserves numeric value but changes the captured callable source. Two distinct *yield-only* failures: `iterator-ordinary-negative` and `destructure-proxy-ordinary-negative` produce behaviorally equal output and zero renaming. These should not be conflated with the five incorrect-output cases. Logs: https://github.com/FlareZ123/obfs/actions/runs/46132219487.
- Earlier unpatched 96-case branch `agent2/formal-param-host-call-iterator-falsifiers-20261128`, CI **46092252938** produced the same seven-case split on the same three operating systems.

## Exact corpus distribution (frozen 96-case donor)

Parsed the complete `CFG_CARRIER` JSON lines from the Ubuntu job of the source-pinned [46132219487](https://github.com/FlareZ123/obfs/actions/runs/46132219487), rather than counting just red TAP outcomes. Out of 96 individually executed native cases, **72** had a native WeakMap prototype source path and **24** did not. Treating the compiler's `group || local` source-observer predicate as a classification **only on these concrete executions** gives the following empirical confusion matrix:

| Exact native path | Refusal detected | Refusal not detected |
|---|---:|---:|
| WeakMap prototype source path executed (72) | **67** | **5** (actual source parity red) |
| No WeakMap prototype source path executed (24) | **2** (zero-yield under this test) | **22** |

All five misses correspond exactly to the call-protocol and inline-class constructor cases above; the two refusals on the ordinary native path are `iterator-ordinary-negative` and `destructure-proxy-ordinary-negative`. The 2:5 error counts are not a static-analysis proof of false positives/negatives for all possible host environments: a single native execution of an opaque iterator or Proxy is not sufficient to establish whole-program property-renaming safety. The instrumented source values distinguish runtime parity from numeric parity and isolate candidate work from the separate frozen protection-yield gate.

## Independent 3-OS falsification of own-call-protocol forwarding

A second, **source-pinned and separate** causal control froze the initial helper/inline-constructor repair but intentionally did **not** carry the own-call-protocol mutation guard. GitHub Actions run [46132429908](https://github.com/FlareZ123/obfs/actions/runs/46132429908) at source SHA `f514ce3e2baf6f6c773ff4f280afbed88ee1fc26` **FAILED identically on Ubuntu, macOS and Windows**. In each mode COO, SCO, SNO, the following three cases executed a real WeakMap prototype source hook but emitted a source-mutated function (`bindings=4`, `group=false`, `local=false`, `parity=false`):

- `own-call-drops-forwarded-argument`: `fill.call=function(){fill();}` overrides forwarding so the apparently provided numeric argument is silently dropped and a WeakMap-producing formal default executes.
- `own-apply-drops-forwarded-argument`: same via an own `apply` method.
- `own-bind-drops-prebound-argument`: an own `bind` returns the target, so a later call executes the default despite an apparently bound numeric argument.

The `Object.defineProperty(fill,'call',...)` control was **already** conservatively protected in this donor (`group=true`, `bindings=0`, native/emitted source parity). The two earlier Ordinary-path yield-only failures remained; they are separate from these three newly verified semantic regressions. This 3-OS red control establishes a clear target for the scoped own-call and alias guard, not a general proof that the guard is sufficient.

## Candidate, not a verified fix

Research branch `agent2/host-call-own-property-donor-falsifier-20261128`, currently `fdc9e28f099dc052232ca03afb05d609dfc8734f`, carries a **120-case** matrix plus bounded source changes. Its compiler records indirect calls, supplies the receiver's actual abstract value, joins effects through an identically cloned lexical heap, handles inline class constructors and concise arrows, conservatively recognizes own `.call/.apply/.bind` method overrides/aliases, and includes possible async/generator body effects. The test added own protocol overrides that intentionally *drop* supplied arguments, transitive and mutable aliases, object-field function escape, `this` receiver writes, repeated safe protocol calls, ordinary negative-yield controls, and asynchronous body effects. Exact focused [CI 46133186759](https://github.com/FlareZ123/obfs/actions/runs/46133186759) at SHA `fdc9e28f` completed **failed, with a precisely bounded result:** all **120** native/emitted fixtures exhibited **zero semantic-parity mismatches in all three COO/SCO/SNO modes on Ubuntu, macOS and Windows**. The only two red TAP assertions were *yield-only* `iterator-ordinary-negative` and `destructure-proxy-ordinary-negative`, each producing `bindings=0` on native Ordinary paths. The Ubuntu log's full `CFG_CARRIER` records comprise 89 native WeakMap-source paths and 31 Ordinary paths; no `parity=false` evidence exists across the 120×3 mode observations on any OS. Because the focused test step failed, **subsequent JSDoc/typecheck steps did not establish a pass**, and this branch is not release-approved.

One subtlety: a local `fill.call(null, 23)` ordinarily skips `fill(x = sideEffect())`'s default, but this is **not sound** if the function owns an overridden `call` that invokes `fill()` instead. Treating native Function.prototype methods as unconditionally immutable across arbitrary dynamically supplied host code or all imported modules is also unproved. The current branch's whole-use proof and local override scan are bounded syntactic guards, not a proof under a fully hostile or instrumented realm.

## Independent class-definition-time peer falsification (Agent 4)

Agent 4 extended this donor's exact `test/agent3-weakmap-cfg-matrix.test.js` to **126 cases** on branch `agent4/agent2-inline-class-construction-static-review-20261128`, commit `c27a6e0c7d72a384ad46aba24d22615f8bf0abf6`. The Ubuntu job of [CI 46134009687](https://github.com/FlareZ123/obfs/actions/runs/46134009687) confirmed **four additional real native/emitted source mismatches** (`inline-class-static-block-new`, `inline-class-static-field-new`, `inline-class-computed-key-new`, `inline-derived-pure-base-static-block-new`) and **two zero-yield Ordinary-path controls** (`inline-class-static-ordinary-positive`, `inline-class-computed-primitive-positive`). **Windows/macOS were queued at report time; this is not yet a 3-OS claim.** The mechanism is omission of ClassExpression evaluation (static initializers and computed ToPropertyKey) before a `new` call's constructor. Source-level safety cannot be inferred from replaying constructor parameter defaults alone.

I imported the six peer witnesses into `agent2/cross-module-call-protocol-taint-fix-20261128` and added a separate instance-field initializer effect witness and literal-control pair. An intentionally conservative inline class no-effects certificate now declines writes from nontrivial static blocks, side-effecting static/instance field initializers and unproved computed element keys while retaining literal-only static/instance field and computed-key cases. That candidate **is not validated** by its own 128-case and SCO HTTP focused CI yet. Agent 4's independently vetted 150-fixture narrow inert-class grammar at `agent4/class-static-inert-effect-proof-20261128` SHA `7c7024e11c12a13c67d2c42839f93b10586d2d74` is not automatically integrated into this candidate; no false claim of combined validation is warranted.

## ECMAScript semantic anchor

The normative [ECMAScript 2026 Function.prototype clauses](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-properties-of-the-function-prototype-object) describe builtin `apply` as building an argument list from an array-like value and builtin `call` as forwarding arguments and the supplied receiver. `bind` creates a distinct bound-function exotic. These algorithms apply when the method lookup resolves to the corresponding intrinsic; a function's own method, or a mutation to the shared `Function.prototype` in another file, is not covered by an unconditional builtin-forwarding assumption. Likewise, [Function.prototype.toString](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-function.prototype.tostring) returns source text for eligible ECMAScript functions; numeric-result equivalence does not imply exact-source equivalence.

## Security-performance decision

This is primarily a **correctness/fidelity** investigation. Additional conservative guards may reduce obfuscation yield; no positive static-deobfuscation advantage, dynamic-extraction resistance, domain/URL lock, or <=2.5x speed conclusion follows. Preserve the frozen six-module release decision and demand independently measured security delta against equal-trust ordinary minification. Keep the two source-pinned native-negative yield losses visible rather than weakening safety merely to force a green count.

## Required next evidence

- The 120-case candidate now has exact pinned 3-OS output-parity evidence, but the two positive-yield assertions remain red; strict JSDoc was not independently proved by that failed run. The newer 128-case integrated class/protocol branch and separate SCO HTTP test still require their own exact-head receipts.
- Review the `this` heap remapping and local method override escape proof with a second reviewer. In particular, challenge opaque function escapes, captured aliases, host patches of `Function.prototype.call`, and imported module mutations.
- If the 120-case source-pinned compiler branch is green apart from deliberately conservative yield controls, compare it with a source-identical baseline in the frozen candidate; do not silently merge or change `results/README.md` without broader integration tests.
