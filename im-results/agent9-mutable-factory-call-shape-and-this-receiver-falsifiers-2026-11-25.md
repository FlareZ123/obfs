# Agent 9: mutable-factory call-shape and object-method receiver falsifiers

**Date:** 2026-11-25 12:00 UTC  
**Status:** four runtime-confirmed false-safes in the mutable-factory/member-flow donor family; one additional recursion failure in Agent 10's latest snapshot.  
**Scope:** research-only callable/source-observation helper. No production compiler source changed.

## Summary

The mutable factory repair handles direct local factory calls, mutable aliases to local function declarations, multiple assigned factory targets, and stored bound-function aliases. It is not yet a complete call/receiver model.

A 12-case VM-backed adversarial test file demonstrates:
- four false-safe cases shared by the tested Agent 1 and Agent 10 repair snapshots;
- a recursion failure specific to the tested Agent 10 snapshot;
- positive controls for direct calls, `.call`, stored `.bind`, property-specific field reads, multiple-assignment union, and primitive sibling reads.

Each false-safe test first executes the source in Node's VM, confirms the external host receives the actual `hidden` function, and confirms host-side `Function.prototype.toString` recovers its source. The subsequent static assertion then fails because the analysis does not mark the callable held.

## Reproducers

### A. Function invocation shapes

The factory creates a local class instance whose field contains `hidden`. These runtime forms all deliver that field callable to the host:

```js
function hidden() { return 1; }
class Local { callback = hidden; }

function entry() {
  let owner;
  let create;
  create = () => new Local();

  // False-safe in the tested snapshots:
  owner = create.apply(null, []);
  // Also false-safe:
  owner = create.bind(null)();

  external(owner.callback);
}
module.exports = entry;
```

Controls:
- `create.call(null)` is recognized in the tested snapshots.
- `const bound = create.bind(null); owner = bound();` is recognized.
- Direct `create()`, mutable alias to a function declaration, recursive direct factory (Agent 1 snapshot), and union of multiple mutable assignments are recognized.

The gap is not simply “mutable factory aliases are unknown.” It is the callee-expression shape: `.apply` and an immediately invoked `.bind()` result are not resolved like direct identifier calls, `.call`, or a bound function first stored in a local binding.

### B. Object-method receiver binding

```js
function hidden() { return 1; }

function entry() {
  const owner = {
    callback: hidden,
    read() { return this.callback; }
  };
  external(owner.read());
}

module.exports = entry;
```

The same disclosure occurs with the sink inside the method:

```js
const owner = {
  callback: hidden,
  read() { external(this.callback); }
};
owner.read();
```

The analysis resolves the object method as a possible call target but does not bind the method's `ThisExpression` to the `MemberExpression` receiver. Consequently, both a returned `this.callback` and a direct host sink `external(this.callback)` remain unresolved.

A negative control where `read() { return 7; }` leaves the unrelated `hidden` callable unheld, so a repair should preserve property-specific precision rather than mark every callable on every method receiver unconditionally.

## Cross-platform evidence

### Agent 1 mutable-factory repair snapshot

- Branch: `agent9/agent1-mutable-factory-runtime-verify-20261125`.
- Test commit: `2c8e3ba1511fbfda5e67b5d9235671b782e05532`.
- Base review line: `agent1/member-flow-mutable-factory-alias-review-20261125`; latest helper blob observed there: `f08ae483e3185a023c57b987e642a2d10cbc7ead`.
- Run [45609156393](https://github.com/FlareZ123/obfs/actions/runs/45609156393): both Ubuntu and Windows fail **4 of 12** tests.
- Failures: `.apply`, immediate `.bind(null)()`, object method returning `this.callback`, object method passing `this.callback` to a host.
- The recursive mutable factory case passes on this Agent 1 snapshot. Its `callReturnExpressions` uses negative source-position markers alongside nonnegative BindingIds to stop recursive return graphs.

### Agent 10 latest mutable-factory snapshot

- Base branch head: `agent10/member-flow-counterexamples-20261125` at `b1e47b28e6ddb96823d8953eb67bb01a600c4c95`.
- Helper blob: `a7a73e6fb71a2f1c511847e0b6e934ee337dd782`.
- Verification branch: `agent9/agent10-latest-call-this-gap-review-20261125`.
- Test commit: `afc79ca4179d5e5b08cb711b690925b111256f19`.
- Run [45609383111](https://github.com/FlareZ123/obfs/actions/runs/45609383111): both Ubuntu and Windows fail **5 of 12** tests.
- The same four false-safe cases fail. In addition, the recursive mutable factory case throws `RangeError: Maximum call stack size exceeded`, with the stack cycling through `callableNodesForValue`, `callReturnExpressions`, and `memberValueExpressionsForProperty`.
- The Agent 10 snapshot's `callReturnExpressions` expands possible mutable call targets but does not apply a per-function recursion marker before traversing returned expressions. The Agent 1 marker is a tested candidate for closing this separate recursion defect.

### Test disposition

| Case | Agent 1 snapshot | Agent 10 snapshot |
|---|---|---|
| Direct mutable arrow factory | Pass | Pass |
| Mutable alias to function declaration | Pass | Pass |
| Recursive mutable factory | Pass | Stack overflow |
| Property-specific callback read; unrelated callable sibling stays safe | Pass | Pass |
| Multiple mutable factory assignments | Pass | Pass |
| `factory.call(null)` | Pass | Pass |
| `factory.apply(null, [])` | **False-safe** | **False-safe** |
| Immediate `factory.bind(null)()` | **False-safe** | **False-safe** |
| Bound factory stored in local variable | Pass | Pass |
| Object method returns `this.callback` | **False-safe** | **False-safe** |
| Object method sends `this.callback` to host | **False-safe** | **False-safe** |
| Object method returns primitive; unrelated callable stays safe | Pass | Pass |

## Repair directions

1. **Normalize call targets by expression shape.** Resolve a callable callee expression rather than only a narrow set of callee node types. Add explicit `.apply` semantics and immediate bound-call handling. For `.apply`, map statically known argument arrays; when receiver/argument mapping cannot be proved, fail closed rather than silently returning no targets. Keep the passing `.call` and stored-bound controls.
2. **Carry receiver context through method analysis.** For `obj.method()`, bind `this` inside the method body to the receiver expression. Resolve `this.property` for both return expressions and host-call arguments. If the receiver cannot be resolved, conservatively mark possible callable values on it held. Preserve the primitive-return negative control.
3. **Retain recursion guards.** Port Agent 1's negative source-position marker (or an equivalent active-function set) into Agent 10's mutable factory expansion before recursively traversing return expressions.
4. **Re-run the 12-case runtime matrix and the existing 33-case class-field / 116-case donor bundles.** The earlier 116/116 result [45605478954](https://github.com/FlareZ123/obfs/actions/runs/45605478954) belongs to the earlier pre-mutable-factory helper snapshot (`ce55d681d595a3995d93f424ecc603b560830c17)); it does **not** validate the later mutable-factory patches.

## Limits

These are false-safes in research helper snapshots, not proof of a production obfuscator weakness. No `src/`, `bin/`, PR #374, or production source was modified. No cross-file, SCO/COO/SNO, hostile-runtime, tamper-resistance, source-secrecy, or 2.5x compute-budget acceptance is established. Keep all branches separate from production until the receiver and call-shape gaps, recursion behavior, and full repository/mode-specific gates are resolved.
