# Agent 10: captured-instance closure alias bypasses class-field deferral guard

**Date:** 2026-11-25  
**Status:** confirmed false-safe in Agent 4's post-`ThisExpression` donor; no repair validated  
**Scope:** experimental ambient-call/source-observation effect analysis only. No production compiler source changed.

## Finding

The post-fix `fieldFunctionUsesInstanceReceiver(fn)` rejects field functions whose AST contains `ThisExpression` or `Super`. That closes the direct receiver cases, but it does not account for a field function reading the class instance through a captured mutable binding.

A minimal witness is:

```js
let owner;
function hidden() { return 1; }
function leak() { external(owner.callback); }
class Local {
  callback = hidden;
  leak = leak;
}
function entry() {
  const instance = new Local();
  owner = instance;
  instance.leak();
}
module.exports = entry;
```

The field function does not use `this` or `super`. It closes over `owner`, which is assigned the local instance before `instance.leak()` is called. `external` therefore receives `hidden`. The current MemberExpression resolver follows strict local-record member values and const initializers, but does not propagate the mutable `owner` binding's `bindingValueExpressions` through `owner.callback`; the host-call sink misses the callback.

The same pattern also works when `owner` is local to the exported `entry` function, and with inline FunctionExpression or ArrowFunctionExpression field initializers. Therefore this is not confined to the Identifier initializer branch or to a top-level CommonJS binding.

## Reproduction evidence

Test-only branch: `agent10/agent4-class-field-closure-alias-review-20261125`.

1. Commit `1d15b267cc0f56cee70f32b865aa14f0f3f3f1a7` adds the module-scope mutable alias witness. Run [45584939471](https://github.com/FlareZ123/obfs/actions/runs/45584939471) fails on Ubuntu and Windows: 20/21 tests pass; the new test reports `hostHeldCallable=false`, expected `true`.
2. Commit `9a2236d1bfee0567816fee1f7901e90bce99a110` adds the function-local mutable alias variant. Run [45585153164](https://github.com/FlareZ123/obfs/actions/runs/45585153164) fails on Ubuntu and Windows; both mutable-closure cases fail.
3. Commit `a6e6b16f362dd92fd7a8cb568f060000e5e65afe` adds inline FunctionExpression and ArrowFunctionExpression field variants. Run [45585356409](https://github.com/FlareZ123/obfs/actions/runs/45585356409) fails on Ubuntu and Windows: the function-local, inline-function, and arrow-field closure alias controls all fail with `hostHeldCallable=false`, expected `true`.

The tests are red-first adversaries against Agent 4's fixed-this donor source, not production obfuscator integration tests. The earlier post-this 20-case green [45584754204](https://github.com/FlareZ123/obfs/actions/runs/45584754204) and combined 102-case green [45584933625](https://github.com/FlareZ123/obfs/actions/runs/45584933625) predate these closure-alias cases and do not cover them.

## Analysis and possible repair direction

The class-field admission helper currently proves that the function initializer is locally resolved and has no explicit receiver-sensitive `this` / `super` use. It does not prove that the function body cannot read the instance through an outer lexical alias. The MemberExpression candidate path consults `localRecordMemberValues` and `initializerForBinding`; the latter is based on const initializers and does not follow the mutable alias assignment in this witness.

Possible conservative directions for the donor:
- extend the shared value-flow analysis so MemberExpression reads can resolve class-instance aliases through assignments and captured bindings; or
- refuse class-field deferral when a field function/arrow captures mutable or otherwise unproven outer bindings that can be object aliases.

Any guard must cover Identifier, FunctionExpression and ArrowFunctionExpression initializer forms. A narrow check for `ThisExpression` / `Super` alone is insufficient. The tests also show that moving the mutable binding into the exported function's local scope does not remove the gap.

## Disposition

- This is a confirmed false-safe in the experimental class-field deferral/effect-analysis donor after the direct-this repair.
- Agent 4's 19/20-case and combined donor green receipts are stale with respect to this new adversary; do not use them as integration acceptance.
- Keep the donor isolated until the mutable captured-instance alias flow is addressed and the expanded class-field plus combined matrices pass on both OSes.
- No production source, cross-file/import proof, browser behavior, full repository gate, runtime benchmark, or 2.5x compute result is established. The primary strong-protection objective remains RELEASE-BLOCKED.
