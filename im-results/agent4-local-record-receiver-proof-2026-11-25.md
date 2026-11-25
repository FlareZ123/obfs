# Agent 4: bounded local-record receiver proof for callable carrier analysis

**Date:** 2026-11-25  
**Branch:** `agent4/agent9-local-owner-precision-20261125`  
**Latest donor commit:** `bc16e825f68082c64023fc17225ce2a635d80e33`  
**Status:** research-only donor; not production integration, compiler acceptance, or release evidence

## Question

Can the ambient-call donor distinguish a callable written into a provably private local object record from a callable published through an unknown or escaping receiver, without losing callable-flow tracking when a stored field later escapes?

The pre-existing member-write rule conservatively treated every `owner.key = callable` as `HostHeldCallable`. That is safe for unknown receivers, but overtaints a narrow case where the receiver is a fresh, same-function, non-escaping ordinary object with a pre-existing own data slot.

## Candidate rule

The donor now admits a member write as a private local-record write only when all of these conditions hold:

- The receiver binding has one `const` declaration and a direct `ObjectExpression` initializer.
- The initializer contains only unique, non-computed ordinary data properties with statically known keys and primitive initial values.
- No `__proto__` slot, accessor, method, spread, computed initializer, or duplicate key is admitted.
- Every receiver reference is a same-function static member access to one of those pre-existing own slots.
- Whole-object uses, aliases, closure captures, receiver arguments, returns, reflection, dynamic keys, calls through the field, updates, deletes, and other unproved uses reject the proof.
- A callable written into an admitted slot is retained in a per-binding/per-key value map. Member reads consult that map so returns, host arguments, local actual-to-formal flow, and escaping closures still propagate the callable.
- If any `WithStatement` exists in the source unit, the local-record proof is disabled. The current resolver does not provide a sound per-reference binding map through a `with` environment. The donor therefore marks all functions in the source unit `HostHeldCallable` for that case. This is intentionally broad and temporary.

This is a narrow value-flow refinement, not a general alias/heap analysis. Multiple writes are unioned rather than path-sensitively overwritten, which can overtaint but should not erase a possible callable value.

## Red/green evidence

All runs used the repository's existing `manual-validation.yml` focused-test path, Node 22.23.4, and independent Ubuntu/Windows jobs.

| Run | Source pin / test state | Result |
|---|---|---|
| [45576211578](https://github.com/FlareZ123/obfs/actions/runs/45576211578) | Initial 7-case receiver matrix, before donor change | Expected red on both OSes: 6/7 pass; private local own-data receiver was incorrectly held |
| [45576512934](https://github.com/FlareZ123/obfs/actions/runs/45576512934) | Initial local-record proof, 7 cases | Green on both OSes; project, external, and paired-budget JSDoc checks green |
| [45576756424](https://github.com/FlareZ123/obfs/actions/runs/45576756424) | Expanded 12-case escape/sink matrix | Green on both OSes; all focused JSDoc stages green |
| [45577005380](https://github.com/FlareZ123/obfs/actions/runs/45577005380) | Added `with`-body shadowing negative | Expected red on both OSes: 12/13 pass; the initial local-owner proof was unsound under `with` |
| [45577122187](https://github.com/FlareZ123/obfs/actions/runs/45577122187) | Per-reference with-body veto | Still red on both OSes; the resolver did not provide the expected local binding for the callable reference |
| [45577299283](https://github.com/FlareZ123/obfs/actions/runs/45577299283) | Whole-source local-owner veto when `with` exists | Ubuntu remained red; the member-write sink could not recover the callable binding through the unresolved `with` reference |
| [45577462298](https://github.com/FlareZ123/obfs/actions/runs/45577462298) | Conservative `WithStatement` callable fallback; 13 cases | Green on both OSes; focused test and all three JSDoc stages passed |

The 13-case matrix covers: non-escaping own-data writes; whole-owner return; member-value host publication; whole-owner host publication; externally supplied receivers; missing own slots; receiver aliases; member-value aliases; local discard consumers; local return consumers; escaping closure capture; accessor rejection; and `with`-environment shadowing.

The first `with` negative is important: merely disabling the local-owner proof was insufficient because the resolver left the callable identifier unresolved inside the `with` body. The final donor fallback therefore explicitly retains all callable sources in a source unit containing `with`.

## Interpretation

The experiment establishes a bounded precision improvement in a research donor: a private own-data record write no longer taints the stored callable solely because it is a member assignment, while the tested escape paths remain held.

It does **not** establish:
- correctness for arbitrary JavaScript heaps, aliases, reflection, proxies, accessors, or dynamic scope;
- cross-file/imported value-flow support;
- a complete host-effect or source-observation model;
- three-mode compiler integration or transform authorization;
- static-deobfuscation resistance, dynamic-analysis resistance, domain locking, or integrity protection;
- runtime performance or compliance with the 2.5x compute ceiling;
- full repository/manual-validation acceptance.

The temporary source-unit-wide `with` fallback is a known precision cost. A later refinement would need resolver-backed binding identities for `WithEnvironment` lookups and a scope-aware set of affected callables, not identifier-spelling guesses.

## Next validation

1. Run the existing `test/agent4-ambient-throw-callable-review.test.js` and `test/agent9-ambient-call-bindingid.test.js` suites against this exact donor head.
2. Ask Agent 9 to adversarially review the receiver proof and member-value map, especially writes/read ordering, duplicate/conditional writes, and nested receiver uses.
3. Keep the donor isolated until the shared SourceObservationPlan owners decide whether and how this value-flow refinement should be integrated.
4. Do not claim production safety or promote this report to `results/`.


---

## Addendum: scope-aware WithEnvironment fallback and final validation (2026-11-25 08:50 UTC)

This addendum supersedes the earlier source-unit-wide WithStatement fallback description above.

**Latest donor commit:** 74d216e68ca19078526352f8d394a3d7d1449b9e

The fallback is now scope-aware:
- A WithStatement disables local-record proofs in its containing function scope and for owner declarations inside a with body, rather than disabling every local-record proof in the source unit.
- Callable functions in the lexical function scopes visible to the WithStatement are retained as HostHeldCallable. This includes the containing function and enclosing function scopes, including source-unit scope.
- Nested function-local bindings confined to unrelated sibling-function scopes are not tainted by a sibling's WithStatement.
- This remains conservative: every callable in a visible lexical function scope is retained even if the with body does not reference that particular name. A fully reference-specific WithEnvironment model remains open.

The final 15-case matrix covers non-escaping own-data writes; whole-owner return; member-value host publication; whole-owner host publication; externally supplied receivers; missing own slots; receiver aliases; member-value aliases; local discard consumers; local return consumers; escaping closure capture; accessor rejection; with-environment shadowing; unrelated sibling-function scope preservation; and preservation of a private-record proof when with occurs in another sibling function.

| Run | Validation | Result |
|---|---|---|
| [45578944761](https://github.com/FlareZ123/obfs/actions/runs/45578944761) | Scope-aware WithStatement fallback; 14-case matrix | Green on Ubuntu and Windows; all focused JSDoc stages passed |
| [45579229059](https://github.com/FlareZ123/obfs/actions/runs/45579229059) | Scoped local-record with veto; 15-case matrix | Green on Ubuntu and Windows; all focused JSDoc stages passed |
| [45579472094](https://github.com/FlareZ123/obfs/actions/runs/45579472094) | Existing Agent 4 ambient-throw/callable review suite | Green on Ubuntu and Windows; all focused JSDoc stages passed |
| [45579481176](https://github.com/FlareZ123/obfs/actions/runs/45579481176) | Existing Agent 9 BindingId ambient-call suite | Green on Ubuntu and Windows; all focused JSDoc stages passed |

The earlier 13-case run 45577462298 validated the initial broad fallback. The 14/15-case runs supersede it for the final scope-aware implementation. The two existing donor suites were also run against the same donor head and passed. No full repository validation, production integration, cross-file analysis, runtime benchmark, or 2.5x budget result is claimed.


## Final combined donor validation (2026-11-25 09:14 UTC)

The combined regression entry point, test/agent4-ambient-call-regression-bundle.test.js, passed on Ubuntu and Windows with all focused JSDoc stages in [run 45583159063](https://github.com/FlareZ123/obfs/actions/runs/45583159063). It loads the local-record matrix, class-field matrix, existing Agent 4 ambient-throw/callable suite, and existing Agent 9 BindingId ambient-call suite. This validates the scope-aware with fallback, local-record member-value map, class-field deferral, and reassigned callable-binding union together at the donor level.

This is still not full repository acceptance, SourceObservationPlan integration, cross-file/import flow, a runtime benchmark, or 2.5x compliance. Keep the donor on its experimental branch pending Agent 9/Agent 3 review.


## Final post-class-field validation (2026-11-25 09:21 UTC)

After the identifier-resolved class-field receiver guard, the combined regression entry point passed on Ubuntu and Windows with all focused JSDoc stages in [run 45584385411](https://github.com/FlareZ123/obfs/actions/runs/45584385411). The bundle loads the 16-case local-record matrix, 19-case class-field matrix, existing Agent 4 ambient-throw/callable suite, and existing Agent 9 BindingId ambient-call suite.

This is still focused donor validation, not full repository acceptance, SourceObservationPlan integration, cross-file/import flow, runtime benchmarking, or 2.5x compliance.
