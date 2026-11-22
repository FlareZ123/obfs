# SCO relocated-private unqualified `typeof`: free host binding mismatch

**22 November 2026, Agent 36.** Intermediate compatibility and static-admission
result; scope deliberately bounded to an unqualified `typeof Identifier`
expression. This neither proves complete free-name resolution nor improves
attacker extraction cost.

## Reproducible original-source mismatch

A JavaScript function containing `return typeof externalBridge;` can be
executed without an exception in two different realms, while observing
different results depending on the host-owned `externalBridge` binding.
The original private function can run with an injected browser global; after
SCO migration it runs under trusted Node globals.

A minimal runtime witness on Node.js **v22.16.0**, using two isolated
`node:vm` contexts:

```js
const {runInNewContext}=require('node:vm');
const expression='typeof externalBridge';
const source=runInNewContext(expression,{externalBridge:{accept(){}}});
const target=runInNewContext(expression,{});
console.log({source,target});
```

Observed `source: 'object', target: 'undefined'`. This is a controlled
cross-realm host-state simulation, **not a live Chromium observation**. The
compiler previously accepted both a selected private export containing
`typeof externalBridge` and private ESM dependencies containing that
expression. The static host-capability scanners recognized named browser
APIs and `globalThis.externalBridge` but not the unqualified unknown name.
A concrete name is sufficient to demonstrate this deterministic mismatch;
a complete set of real browser globals is much larger.

## Bounded correction

`src/sco-selective-partition.js` now uses
`firstUnprovedTypeofReference(root, bindings, moduleBindings, rootFormals)`
on the direct selected-private export/helper bodies and audited static ESM
dependency modules, **after** their existing host-specific admission checks.

A `typeof name` operand is admitted only when:

- it is an unsullied named ECMAScript standard realm intrinsic or
  `globalThis` with no same-name declaration in the module; or
- it has exactly **one** AST declaration in the source module and the
  declaration is a compiler-verified server constant/import, a selected
  function formal, an enclosing nested function formal/name, or an
  enclosing scope's preceding primitive literal `const` or function
  declaration.

The unique declaration is necessary, not alone sufficient. A same-named
binding located only in a sibling scope does not prove lexical ownership.
Unknown names, ambiguous declarations, computed/dynamic source bindings,
and unsupported local forms fail closed. An explicit local constant and
a parameter remain eligible; `typeof undefined` remains eligible. The
earlier independent realm-local intrinsic check **still rejects**
`typeof Math`, so no intrinsic-state guard was weakened.

For audited static dependencies, a unique top-level literal `const`
is additionally proven, as are unique static import bindings. Browser-root
checks still run first, preserving their more specific diagnostics and
the earlier inert-key positive controls.

The analysis uses the existing Acorn AST and shared `collectBindings`
utility. It runs **during opt-in compilation**, leaving accepted generated
facade source and request-time behavior unchanged.

## Source-pinned tests

- [Red-first run 44998873421](https://github.com/FlareZ123/obfs/actions/runs/44998873421),
  exact SHA `06b4316031759322f1577dd225f5008c8dd6d87a`:
  Ubuntu and Windows both reported
  `Missing expected exception: selected private export: externalBridge`.
- [Initial patch run 44999087267](https://github.com/FlareZ123/obfs/actions/runs/44999087267),
  exact SHA `31c271c5eb2b121253c52a03925e7ccd29afac90`:
  new unknown-root refusal succeeded, but an overbroad positive-control
  expectation for `typeof Math` failed because the preexisting
  intrinsic-state guard already correctly refuses direct observation.
  This was a test expectation defect, not a new compiler rejection.
- [Corrected two-platform graph workflow 44999158768](https://github.com/FlareZ123/obfs/actions/runs/44999158768),
  exact SHA `30e049feec71b1237c6477a633fc66ec317149b9`:
  Ubuntu and Windows both **passed**, including private graph semantics,
  source-publication/HTTP checks, generated example, and strict JSDoc.
  Source tests cover three unknown names × three migration surfaces,
  five selected local/standard positive programs and three graph-local
  positive programs at two depths.
- [Integrated final graph run 44999417994](https://github.com/FlareZ123/obfs/actions/runs/44999417994),
  exact SHA `e4b9bd6c39eaaad5b865e13a58bd7b957a1ac0f0`:
  **Ubuntu and Windows passed** with concurrent private host timer/URL
  guards retained. It additionally proves that a single same-named
  declaration in a sibling function does not authorize a free host read
  in its parent function, in both direct and transitive graph shapes.
  The [SCO deployment guide](../docs/SCO_PARTITION.md) describes the
  bounded admission contract and the separately retained fixed
  `node:` builtin import exception.

## Remaining limits

This is intentionally a fail-closed syntactic proof, so code such as
`typeof name` with multiple same-named **distinct** valid lexical
bindings can be declined unnecessarily. The helper does not solve
whole-program references generally, host mutation, property aliasing,
opaque `eval`/runtime loaders, browser extension injection, or
transitive object provenance. Direct unknown property reads
`externalBridge.value` and dynamically constructed global root access
require separate analysis. No runtime 2.5× or isolation-cost claim follows
from build-time refusal. The overall obfuscator **RELEASE-BLOCKED**
assessment remains intact.
