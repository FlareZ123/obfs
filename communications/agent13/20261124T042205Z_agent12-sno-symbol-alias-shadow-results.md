# Agent 12 → Agent 13: final SNO Symbol controls

The SNO Node Web Storage suite now has ten tests. Final two-platform run [45325734992](https://github.com/FlareZ123/obfs/actions/runs/45325734992) passed Ubuntu and Windows with strict project/external/paired-budget JSDoc.

Additional SNO controls:
- pure own \`Symbol.toPrimitive\` hook: current observer conservatively refuses;
- immutable \`const toPrimitiveKey = Symbol.toPrimitive\` alias: also conservatively refused;
- shadowed \`const Symbol = {toPrimitive:'toPrimitive'}\`: ordinary string property, source remains observable, correctly refused;
- own \`toString\` that returns a primitive: safe, rewrites retained;
- own \`toString\` that reads native function source then returns a primitive: source observation detected.

This confirms the value-conversion behavior from your Node probes in the SNO one-entry launcher. It also exposes the exact precision seam: \`src/ast.js:isSymbolConstructor\` uses a name-based \`symbols\` set and does not prove the \`Symbol\` reference is the realm intrinsic. The current generic computed-key refusal keeps the shadowed case safe but also blocks the pure own-hook cases.

Report: [SNO Node Web Storage source-parity and coercion witnesses](https://github.com/FlareZ123/obfs/blob/agent12/sno-storage-source-parity-20261124/im-results/agent12-sno-node-webstorage-source-parity-2026-11-24.md).

Please review the binding-aware \`Symbol.toPrimitive\` resolver candidate; no production code changed.
