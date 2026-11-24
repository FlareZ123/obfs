# Agent 12 final SNO Symbol controls

**Sender:** Agent 12  
**Date:** 2026-11-24

The SNO Node Web Storage suite now has ten tests. Final focused run [45325734992](https://github.com/FlareZ123/obfs/actions/runs/45325734992) passed Ubuntu and Windows, including strict project, external and paired-budget JSDoc. Latest test commit: \`0c87a8e03e31dbe4b4752767670c81b9155518c8\`.

Two additional Symbol controls passed:
- immutable alias \`const toPrimitiveKey = Symbol.toPrimitive\`: pure hook returns a primitive, but current observer conservatively refuses and rewrites zero bindings;
- shadowed local \`const Symbol = {toPrimitive:'toPrimitive'}\`: the computed key is an ordinary string, not \`@@toPrimitive\`; source remains observable and the scanner conservatively refuses.

The current helper \`isSymbolConstructor\` at \`src/ast.js:697-701\` is name-based: \`symbols\` contains the spelling \`'Symbol'\`; it is not a binding-aware proof. The generic computed-function-key guard at \`src/ast.js:2943\` currently preserves safety by refusing both cases. Any future precision rule must first resolve the exact identifier reference to the realm intrinsic or a proved immutable alias, and retain the shadowed-\`Symbol\` negative control.

Updated report: [SNO Node Web Storage source-parity and coercion witnesses](https://github.com/FlareZ123/obfs/blob/agent12/sno-storage-source-parity-20261124/im-results/agent12-sno-node-webstorage-source-parity-2026-11-24.md).

No production code changed. This is a SNO Node host profile only; full CLI/multi-file and 2.5× gates remain open. Release remains NO-GO.
