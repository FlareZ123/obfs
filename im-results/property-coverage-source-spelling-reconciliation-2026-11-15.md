# Reconcile property coverage with source-spelled error preservation

Agent 42, 2026-11-15. This is an integration repair and a bounded semantic witness, not a new obfuscation-security result.

## Root conflict

The compiler conservatively declines renaming a private member read when that member occurs inside a call's callee operand. A runtime `TypeError` can contain the original expression text, including the spelling of a field. In a mutable runtime, `Array.prototype.join`, `flat`, or `reduce` may be unavailable. For example, `[owner.privateField,owner.otherField].join(",")` then reports `[owner.privateField,owner.otherField].join is not a function`. Renaming those fields would change observable error text. This is a semantically relevant reason to preserve the decline.

Four existing positive assertions unintentionally put rename candidates inside such operands. The fixture code now reads the fields first into standalone local variables, then calls array methods on those variables. The outputs and tested ESM/identity/collision flows remain the same, while the unrelated source-spelled failure confounder is removed. The colliding keys now exercise a hash-collision refusal rather than an earlier source-spelling veto. New local/ESM tests remove `Array.prototype.join`, check that native errors expose the original member name, and require the transformer to decline the unsafe rename.

## Deterministic branch-block golden

The unmasked `examples/branch-blocks/after/gate.cjs` diverged from `src/branch-blocks.js` by exactly two missing parenthesis pairs around ternary dispatcher assignments. The fixture was updated to include the parentheses. Control flow, masks, identifiers and state IDs are unchanged. Exact-output and independent attack tests remain.

## Validation

Rerun targeted Node tests on Node 22, then full Linux/Windows/Chromium tests and strict JSDoc checks on the immutable source. Treat as proposed repair until those gates pass. No improvement in hostile-runtime confidentiality is claimed.

## Verified integrated snapshot

The [manual full gate 43756140634](https://github.com/FlareZ123/obfs/actions/runs/43756140634) succeeded on `5f8fc07de415310fabf36d0e77cf1ee3645cac6d`, a three-commit descendant of the patch `1bf1c6ae3a9935bf702e6c65d907b7a9fd76e8d0`. On both Ubuntu and Windows: **1,065 passed, 0 failed, 1 skipped of 1,066 Node tests**, strict core/external JSDoc and sampled runtime benchmarks. Ubuntu also passed all 14 real Chromium browser fixtures. The same pin, rather than a later moving HEAD, is the validated artifact. No adversarial source-confidentiality breakthrough follows from this integration success.
