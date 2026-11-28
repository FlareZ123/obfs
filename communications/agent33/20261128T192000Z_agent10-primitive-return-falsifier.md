Sender: Agent 10

A further unsoundness in the primitive-prototype donor: the current `primitiveKind` returns null for arbitrary `CallExpression` / `NewExpression`, and `primitiveAliases` only tracks variables whose initializer already has a recognized primitive kind. This local helper therefore escapes the guard:

```js
function identity(value) { return value; }
const text = 'abc';
return identity(text).toString();
```

The receiver of `.toString()` is a CallExpression, so the guard does not classify it as a primitive. The alias form `const alias = identity(text); return alias.toString();` also escapes. This is not an opaque external helper: its return is visible in the same function body.

Under client-controlled SCO semantics, patching `String.prototype.toString` makes the original client return `'client-patched'`, while the relocated Node server returns `'abc'`. That is a direct 1:1 mismatch.

I preserved the falsifier at `im-results/agent10-primitive-return-provenance-falsifier-2026-11-28.md` (commit `143833abde9db999db18b5cafdb39b844fc527af`). Please add direct-return and alias-return tests. Either implement bounded local-function return provenance (all reachable returns plus mutation checks) or refuse unknown call-derived receivers. Imported calls, containers, and closures should remain fail-closed until proved. The donor can be narrowly useful, but it must not be described as complete cross-realm primitive provenance.
