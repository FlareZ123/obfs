# Selective SCO intrinsic-realm mismatch and conservative proof guard

**Status:** intermediate correctness research, 2026-11-15. This is a reproducible negative compatibility witness followed by a bounded compiler refusal. It is not a security result.

## Mode and original behavior

A selected-SCO mixed ES module can contain:

```js
export async function protectedOp() {
  Object.prototype.__obfsRealmCanary = 41;
  return 1;
}
export function visible() {
  return ({}).__obfsRealmCanary ?? 0;
}
```

In an original single JavaScript realm, `await protectedOp();visible()` returns 41. After partitioning, `protectedOp` executes in the trusted server realm while `visible` executes in the browser realm. Those realms have different `Object.prototype` instances; a write on one does not populate the other. The observable output would become 0. Node `vm.createContext` creates separate intrinsic objects and the real test asserts the 41-versus-0 witness.

The issue is a semantic admission condition, independent of whether private function source stays on the server, authorization works, or the RPC client is instrumented.

## Reproducer and paired regression

- The actual compiler admission API is `src/sco-selective-partition.js::partitionScoSelectedAsyncExports`.
- Test source is `test/sco-intrinsic-realm.test.js`. The first tests cover explicit prototype access through private functions, public functions and both helper classes, plus an admitted independent control.
- A second four-value by six-alias matrix (24 refusal scenarios) covers `Object.getOwnPropertyDescriptor(Object,'prototype').value`, `Reflect.get(Object,'prototype')`, a binary-computed property spelling, a same-function computed-key alias, destructured `{prototype:proto}=Object`, and `({})['__'+'proto__']`.

**Pre-fix evidence:** targeted [Ubuntu/Windows run 43769778464](https://github.com/FlareZ123/obfs/actions/runs/43769778464), source `a0e0139df188ba6a6e4450e94e702c0c9e0da601`, had **53 passing / 1 failing out of 54 focused Node tests on each OS**. Test 14 was an expected failure: `Missing expected exception: Expected refusal for Object.getOwnPropertyDescriptor(Object,'prototype').value with value 7`.

**Post-fix evidence:** targeted [Ubuntu/Windows run 43770100025](https://github.com/FlareZ123/obfs/actions/runs/43770100025), source `ae45d1aa921601d3355a0ac7b085f5eec646031c`, passed the focused suite on both OS, including JSDoc, SCO browser client modules and real authenticated HTTP fixtures. The workflow runs `node --test` on its named SCO suite and `npm run typecheck` and `npm run typecheck:external`, with separate Chromium fixtures on Ubuntu.

The guard now refuses direct `.prototype` / `.__proto__`, known intrinsic computed-key ambiguity, direct `Object` and `Reflect` prototype reflectors, prototype reflection against known constructors, and destructuring their prototype. The static key reader reuses `src/ast.js::staticString` for bounded concatenated literals. The existing accepted safe sample remains admitted. These checks add parser cost at compiler/build time; runtime protected-work overhead of accepted output is unchanged by this admission guard, but this was **not** separately benchmarked.

## Limits and follow-up

The checker is syntactic and can still miss aliased accessors (for example `const method=Object.getOwnPropertyDescriptor;method(Object,'prototype')`), opaque function calls that mutate intrinsic prototypes, computed constructor aliases or other mutable realm state. Declining a known spelling is neither a general purity proof nor evidence of tamper resistance. The strict 2.5× runtime budget still requires representative whole-session measurement for each deployment.

Next: challenge the guard with independent alias-generation fixtures; improve refusal for first-class reflective methods without indiscriminately disabling useful object APIs; audit accepted clients for remaining cross-realm side effects. The private-source boundary remains subject to authorized chosen-input oracle and relay attacks.
