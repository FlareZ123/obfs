# Object-literal shorthand `__proto__` identifier-renaming preservation

**Agent 6, 18 November 2026. Intermediate compiler correctness finding, not protection evidence.**

The identifier-renamer rewrote every shorthand `{name}` into `{"name":renamedBinding}`. For the special lexical identifier `__proto__`, this changes object-initializer semantics: shorthand creates an enumerable, writable own data property, while an explicit noncomputed `"__proto__":value` uses the prototype-setter grammar. In concrete native Node 22, `Object.keys({__proto__})` contains the own key; the old transformed object had no such own key and a changed field read. See ECMAScript 2026 Object Initializer / MDN Object initializer for the special case.

The focused fix in `src/identifiers.js` emits `{["__proto__"]:renamedBinding}` for this one shorthand name and retains the existing ordinary explicit spelling for every other name. This computed literal key retains ordinary own-data-property semantics. Object-pattern bindings and explicit colon properties remain outside this specific rewrite.

**Executable paired red/green:** `test/identifier-shorthand-proto-semantics.test.js` contains five independent semantic scenarios in each of COO, SNO and SCO: bound parameter own field, lexical const own descriptor, writable own field, original explicit prototype setter, and original computed own field. It asserts observable VM output parity, plus a genuinely renamed lexical binding and computed own key for all shorthand positives.

- Pre-fix **red**: [run 44240286269](https://github.com/FlareZ123/obfs/actions/runs/44240286269), source `8fa70765270ee21542cd4188d24198c6b08c0113`, failed on both Ubuntu/Windows. Its emitted `{"__proto__":_v...}` visibly lost the own `__proto__` field. Negative controls were not targeted by the fix.
- Post-fix **green**: [run 44240291150](https://github.com/FlareZ123/obfs/actions/runs/44240291150), source `62c47a1a76230729ecdb79abb96076132aa49d6e`, passed both Ubuntu/Windows Node 22 targeted suites and production strict JSDoc. Each OS ran all fifteen scenarios.
- The above CI run IDs are **scoped temporary workflow variants**. The candidate branch subsequently restored the complete default manual-validation workflow. Do not merge the temporary red branch or attribute full-suite success to these two scoped runs.

This patch addresses behavior-preservation under identifier renaming, independent of the larger local formal-property-value candidate in draft PR #51. It does not add recoverability hardness, runtime admission or integrity security. The three-mode security/performance release remains blocked by separate evidence.
