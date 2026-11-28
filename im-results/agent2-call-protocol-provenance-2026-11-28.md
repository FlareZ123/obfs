# Function call-protocol provenance and observable source: source-pinned audit (interim)

**Status: source-pinned red baseline; repair is experimental and not release-approved.**

## Scope

The Node three-module `Storage.prototype.setItem` / WeakMap-captured callable source fixture in `test/agent3-weakmap-cfg-matrix.test.js` differs from the trivial numerical-output test. An earlier ESM module can mutate the shared WeakMap instance prototype before a sibling exports an otherwise innocent function. A test runner's `document.title=String(value)` host sink captures its exact `Function#toString` source. A binding rename that preserves `inspect() === 29` but changes its emitted function source is a behavioral regression.

The inherited-protocol call form `fill.call(null)` is a `CallExpression` with **MemberExpression callee**. The existing private local-helper replay in `src/ast.js` recognized direct identifier calls, ordinary object methods and named local class constructions, but did not replay this protocol call's formal defaults. `fill.apply(null,[])`, `fill.bind(null)();` (via a retained bound value), and inline class expression constructors similarly require an effect summary. Native JavaScript verifies that all these invocation patterns can synchronously write a WeakMap into a captured outer carrier before the source-observing storage override.

## Independent baseline evidence

- Frozen source for 96-case donor audit: `agent2/formal-param-96case-donor-audit-20261128` commit `09a3ad9d9b7626bb6acb389db21fa6b6942a10ab`, derived from 80-case source donor `2a5a4d30c15f64951df6004ac0bf75bde645e1e6`.
- Focused GitHub Actions run **46132219487**, exact source pin `09a3ad9d`, **FAILED identically on Ubuntu, Windows and macOS**. Five semantic mismatches: `host-call-default`, `host-apply-default`, `host-bound-default`, `direct-class-expression-new-default`, `direct-derived-class-expression-default`; each preserves numeric value but changes the captured callable source. Two distinct *yield-only* failures: `iterator-ordinary-negative` and `destructure-proxy-ordinary-negative` produce behaviorally equal output and zero renaming. These should not be conflated with the five incorrect-output cases. Logs: https://github.com/FlareZ123/obfs/actions/runs/46132219487.
- Earlier unpatched 96-case branch `agent2/formal-param-host-call-iterator-falsifiers-20261128`, CI **46092252938** produced the same seven-case split on the same three operating systems.

## Candidate, not a verified fix

Research branch `agent2/host-call-own-property-donor-falsifier-20261128`, currently `fdc9e28f099dc052232ca03afb05d609dfc8734f`, carries a **120-case** matrix plus bounded source changes. Its compiler records indirect calls, supplies the receiver's actual abstract value, joins effects through an identically cloned lexical heap, handles inline class constructors and concise arrows, conservatively recognizes own `.call/.apply/.bind` method overrides/aliases, and includes possible async/generator body effects. The test added own protocol overrides that intentionally *drop* supplied arguments, transitive and mutable aliases, object-field function escape, `this` receiver writes, repeated safe protocol calls, ordinary negative-yield controls, and asynchronous body effects. Do not claim it passes; exact run `46133186759` is queued as of 10:01 UTC.

One subtlety: a local `fill.call(null, 23)` ordinarily skips `fill(x = sideEffect())`'s default, but this is **not sound** if the function owns an overridden `call` that invokes `fill()` instead. Treating native Function.prototype methods as unconditionally immutable across arbitrary dynamically supplied host code or all imported modules is also unproved. The current branch's whole-use proof and local override scan are bounded syntactic guards, not a proof under a fully hostile or instrumented realm.

## Security-performance decision

This is primarily a **correctness/fidelity** investigation. Additional conservative guards may reduce obfuscation yield; no positive static-deobfuscation advantage, dynamic-extraction resistance, domain/URL lock, or <=2.5x speed conclusion follows. Preserve the frozen six-module release decision and demand independently measured security delta against equal-trust ordinary minification. Keep the two source-pinned native-negative yield losses visible rather than weakening safety merely to force a green count.

## Required next evidence

- Retrieve the exact latest branch CI source pin and classify each failure by semantic output parity, renaming yield, and JSDoc/runner outcome. Avoid counting queued workflows as passed.
- Review the `this` heap remapping and local method override escape proof with a second reviewer. In particular, challenge opaque function escapes, captured aliases, host patches of `Function.prototype.call`, and imported module mutations.
- If the 120-case source-pinned compiler branch is green apart from deliberately conservative yield controls, compare it with a source-identical baseline in the frozen candidate; do not silently merge or change `results/README.md` without broader integration tests.
