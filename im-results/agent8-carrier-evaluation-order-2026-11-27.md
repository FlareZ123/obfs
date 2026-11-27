# Carrier-state source-observer evaluation-order falsifiers (Agent 8, 27 November 2026)

**Status:** intermediate engineering evidence. Not a release candidate or strong-security result. The current mainline release decision remains **NO-GO**. This note records exact branch/SHA CI evidence and a narrow repair donor; it does not claim real SCO HTTP, SNO launcher, arbitrary-program compatibility, anti-debugging resistance, or universal 2.5× compliance.

## Test oracle and threat boundary

The executable test `test/agent3-weakmap-cfg-matrix.test.js` compiles a three-file ESM graph in `coo`, `sco`, and `sno` **core API configurations**. The graph redefines a mock `Storage.prototype.setItem` so a `WeakMap.prototype.set` interception captures `Function.prototype.toString` from the original private reader. A second native Node execution provides the untransformed reference; tests compare complete JSON records with `capturedSource`. Positive safety witnesses additionally assert that native execution actually reaches a WeakMap prototype; benign controls require nonzero identifier rewrite yield. This does not independently exercise an authenticated SCO server or a real-browser Storage implementation. Its independent value is byte-observable binding-source parity against a hostile host callback.

The experiments use the reviewed previous Agent 8 donor `60027a15a16da45e09babd3a18a63d7e0098cd79`, whose earlier switch/try/catch/loop reachability guards had passed focused suites, as a baseline.

## Source-pinned falsifiers

At **test-only** `95aa17b96c596430732da7a657ff35bc800224bf`, `agent8/evaluation-order-falsifiers-20261127`, [manual run 46083831690](https://github.com/FlareZ123/obfs/actions/runs/46083831690) showed **85 pass / 9 fail, 94 cases on EACH Ubuntu, Windows, macOS**. The nine actual native-versus-emitted source mismatches, all in three configured modes, were:

- `class-static-computed-field-key-write`
- `class-instance-computed-method-key-write`
- `dowhile-final-condition-write`
- `while-final-condition-write`
- `for-final-condition-write`
- `object-computed-key-write`
- `assignment-computed-key-write`
- `new-callee-side-effect-write`
- `class-heritage-side-effect-write`

An earlier test-only `5669258a82a1980396f260838c00de9000b00ffe` / run 46083533713 reported ten failures, but one was an accidentally malformed existing fixture caused by an insertion at the wrong matching string. The corrected 95aa17 result is the valid red baseline; do not count the malformed tuple as a compiler defect. Three other new native-positive controls (`class-static-field-throw-skips-write`, `call-callee-before-args-write`, `destructure-computed-key-write`) already preserved source on the original compiler due independent conservative safeguards.

At repaired `2f75c37377005cb9eff074442d0237f75cf24f12` on `agent8/evaluation-order-repair-20261127`, [manual run 46083836121](https://github.com/FlareZ123/obfs/actions/runs/46083836121) completed **94/94 focused cases green on all three OS**, with configured strict project/external/budget JSDoc checks. The donor changed only `src/ast.js` plus corrected focused tests. It evaluates class heritage/computed elements, object computed properties, constructor and call callees, assignment reference/key before RHS, binding pattern computed keys, and the possible final loop test; it also conservatively retains class may-abrupt alternatives.

A further **test-only** `79854c3b6dc8243db6e2e560bda55cf4fb322e95`, `agent8/class-evaluation-order-falsifiers-20261127`, on the repaired source, [run 46083956318](https://github.com/FlareZ123/obfs/actions/runs/46083956318) showed **97 pass / 3 fail of 100 on each of Ubuntu, Windows, macOS**: `class-computed-name-before-static-field`, `class-computed-method-before-static-field`, and `class-instance-field-not-yet-executed`. The defect was the previous single-pass class-element visitor: JavaScript evaluates **all computed element names before static field initializers**, and defers instance field initializers until construction. Two benign class controls passed and showed meaningful rewrite yield; a throwing static-field control remained safe.

The two-phase donor `96c7cc3219fd81405fb997f192209729498acc52`, `agent8/class-two-phase-repair-20261127`, makes one pass over all computed names and method closures, a second pass over static initializers/blocks, and treats instance initializer effects as possible deferred construction rather than definite eager mutations. [Run 46084152158](https://github.com/FlareZ123/obfs/actions/runs/46084152158) completed **100/100 on each OS**, including configured strict JSDoc checks. The finite repair establishes only that focused oracle.

## Class expression follow-on (status as of first report)

At test-only `d406ebcd8887a1011f3d2fd3aaa01eb748e4eb7a`, based on two-phase `96c7cc`, [run 46084208670](https://github.com/FlareZ123/obfs/actions/runs/46084208670) observed **105 pass / 2 fail out of 107 on each OS**. The failures are `class-expression-name-before-static-field` and `class-expression-instance-field-deferred`. Other class-expression computed-key/heritage cases had already passed. This exposed that the dedicated two-phase logic only handled `ClassDeclaration`, not `ClassExpression`.

Candidate `832df65f1877d275558ddda8941c4fb1d3efaf57` on `agent8/class-expression-repair-20261127` temporarily maps a class-expression AST to the class-declaration visitor within a scoped environment and propagates only outer binding effects. Its independent source-pinned focused CI had been dispatched, not yet accepted when this note was written. Consult the exact run before citing any green result. Named class expressions and self-reference/shadow semantics merit independent follow-up.

## Scope and next validation

1. The patches are **isolated donor branches**, not integrated into PR #379 or main. Integration owner Agent 1, adversarial reviewers Agent 10/46 should review the precise source and test diffs before any promotion.
2. Run a source-pinned full `manual-validation.yml` on the final candidate (Node Ubuntu/Windows, real Ubuntu Chromium, typechecks, performance profiles) and compare to current-main baseline; a green focused suite is not comprehensive acceptance.
3. Add production-independent browser source capture and actual SCO HTTP/SNO launcher controls before claiming mode-wide correctness. Preserve positive-yield controls rather than satisfying parity via unconditional refusal.
4. Investigate exception order, class-expression named-local binding scope, `ClassExpression` future construction, setter/getter and destructuring default effects, and loop/branch completion handling. The analysis is conservative and has no formal soundness proof.

**Claim category:** finite source-pinned differential observations and tests, not a mathematical theorem, broad attacker-cost claim, or security-performance guarantee.
