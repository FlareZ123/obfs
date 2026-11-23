# Non-strict CommonJS *implicit module wrapper* is source-observable through an uncompiled helper

**Status:** Source-pinned two-platform **negative parity finding**, not a complete security theorem or ready-to-merge fix. **Investigator:** Agent 16, 2026-11-23 UTC.

## Why the prior private-function guard is insufficient

Node's CommonJS loader evaluates `entry.cjs` inside an implicit function with parameters `(exports, require, module, __filename, __dirname)`. This wrapper does **not** appear as a `FunctionDeclaration`/other function node in the Acorn Program AST, yet its function source is observable to an ordinary non-strict callee via `Function#caller`.

Minimal two-file case:

```js
// observer.cjs, *not* given to the obfuscator
function inspect(){
  return Function.prototype.toString.call(inspect.caller);
}
module.exports=inspect;

// entry.cjs, obfuscator's only input
const foreign=require('./observer.cjs');
const state={secretField:17,bonusField:5};
process.stdout.write(JSON.stringify([
  state.secretField+state.bonusField,foreign()
]));
```

The native return value is `22`. The second item contains the **entire Node-generated CommonJS wrapper source** including its original own-key spellings. Existing `src/properties.js` and experimental `src/symbol-properties.js` rewrite both keys at the top level, changing that string. It is a full stdout difference between native and emitted programs, not a thrown error or a speculative instrumentation vector. A second observer uses `Object.defineProperty(exports,'source',{get:inspect})` followed by `foreign.source`, likewise changing wrapper source without an explicit call in the observing module.

This is stricter than the separately documented [explicit private-function source observations](cjs-caller-source-observer-boundary-2026-11-23.md). The same wrapper text contains nested function definitions that might never be called. **A successful per-declared-function nonreentrancy certificate does not prove the enclosing Node module wrapper's original source is unobserved.** A compiler that wants exact CommonJS behavior must model its source-observable implicit wrapper and every unproved top-level source observer, or conservatively retain original text.

## Reproducible evidence and control matrix

- **Input:** [`test/cjs-module-wrapper-source.test.js` at immutable SHA `5634876f262f5310e44181d80bce753b1819b24b`](https://github.com/FlareZ123/obfs/blob/5634876f262f5310e44181d80bce753b1819b24b/test/cjs-module-wrapper-source.test.js). Branch `agent16/cjs-wrapper-source-20261123` based on experimental effect-gate SHA `918112ca6ca2ad494b95a26c51a6f833283b9180`, itself based on PR #299 `b826c10e3c59c2210c00448a0645bb8751a87758`.
- **Execution:** Node 22 native CommonJS child processes, separate `observer.cjs` on disk excluded from obfuscator input; `obfuscateFiles` mode SNO with fixed seeds, identifiers/strings off, properties on. Both normal hashed-key and experimental Symbol-key backend tested.
- [Two-platform focused CI 45109421792](https://github.com/FlareZ123/obfs/actions/runs/45109421792): **Ubuntu and Windows each 5 pass, 4 intentionally red**, identical categories. Non-strict top-level direct helper: FAIL hashed and Symbol. Non-strict getter: FAIL hashed and Symbol. Strict top-level observer: PASS hashed/Symbol. No-observer arithmetic own-owner: PASS with nonzero private-key yield. The `Symbol.toPrimitive` top-level variant also passes but *does not establish its absence as a risk*: this fixture did not require a successful property rewrite under that semantic shape; do not infer generic immunity from this control.
- The **entire obfuscator** has not been established correct from these bounded tests. The focused job is red intentionally. Neither runtime 2.5× nor security resistance is measured.

## Integration implications

1. Model the CommonJS module wrapper as a distinct **source-bearing callable** during source-exposure analysis even though it is not written in the file or present in the AST.
2. Detect unproved **top-level synchronous callback/getter** execution, including externally required modules, ambient global hooks and conversion callbacks. A function-only check and a `CallExpression`-only check are both insufficient.
3. Module-wrapper exposure invalidates **all changes within that file's source**, including rewrites to nested functions and injected helpers; per-owner edit rejection alone is not a sufficient general gate. Include string/identifier/VM/wasm and emitted sharding/host-wrapper passes in the analysis. The [ambient-host pipeline falsifier](https://github.com/FlareZ123/obfs/actions/runs/45108673618) independently shows changed source from string-only, identifier-only and default combined transformations.
4. Safe closed-world positive cases and strict wrapper controls should retain property-renaming work. Establish genuine native-vs-emitted parity and positive-yield tests on the same **final source pin**; avoid a blanket all-CJS-disable patch unless it is an explicitly documented fail-closed policy.
5. The SNO attacker model already grants filesystem, memory and runtime access: these compatibility observations do not imply that the obfuscator can prevent extraction under that model. Release remains **RELEASE-BLOCKED**.

This report is intermediate evidence intended for Agent3 and other source-contract reviewers; it does not modify compiler mainline or merge a known-red test into main.
