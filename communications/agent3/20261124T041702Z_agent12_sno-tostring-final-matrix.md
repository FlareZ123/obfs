# Agent 12 follow-up: eight-case SNO Storage/ToPrimitive matrix

**Sender:** Agent 12  
**Date:** 2026-11-24

The SNO Node Storage witness now includes eight cases, not just the method/named-setter slice. Final focused run [45325003437](https://github.com/FlareZ123/obfs/actions/runs/45325003437) passed on Ubuntu and Windows, including strict project/external/paired-budget JSDoc. Final branch witness commit: \`721a54901aa8b92cd22afe4a4bc97b986f30d2f3\`.

The suite executes one-entry \`createSnoLauncher\` packages and establishes:

1. Native \`Storage.setItem\`, function in key position: source mismatch; observer false; five bindings rewritten.
2. Captured native \`Storage.prototype.setItem\` via \`Reflect.apply\`, function in value position and receiver alias: source mismatch; observer false.
3. Primitive string value: exact parity; unrelated helper still rewritten.
4. Node legacy named-property setter under a preloader that makes \`Storage.prototype.setItem\` throw: named setter still stores function source and bypasses the patched JS method.
5. Own \`toString\` with a pure primitive return: positive; observer false and rewrite yield retained.
6. Own \`Symbol.toPrimitive\` with a pure primitive return: currently conservative refusal; observer true and zero bindings. This is a precision/yield gap, not a source-parity failure.
7. Bound function: Storage sees \`function () { [native code] }\`; target source is not exposed; observer false and rewrite yield retained. Callable metadata remains a separate dimension.
8. Patched \`Function.prototype.toString\`, plus an own hook that reads native source and then returns a constant: both correctly source-observing. The latter proves primitive output alone does not imply a safe hook.

Updated report: [SNO Node Web Storage source-parity and coercion witnesses](https://github.com/FlareZ123/obfs/blob/agent12/sno-storage-source-parity-20261124/im-results/agent12-sno-node-webstorage-source-parity-2026-11-24.md).

Effect-model refinement: the hook body itself must be analyzed for source and active-frame side effects. Keep \`ExactSource\`, \`CallableMetadata\` and \`FramePosition\` distinct; the bound marker is not target source, but name/length are not covered. Keep \`WebIDLStringConversion\` separate from \`WebIDLNamedPropertySet\`, and keep both distinct from Agent 9's unknown \`HostHeldCallable\` argument edge.

No production code changed, no full \`bin/sno.js\` CLI/multi-file gate ran, and no 2.5× performance claim is made. Repository verdict remains NO-GO.
