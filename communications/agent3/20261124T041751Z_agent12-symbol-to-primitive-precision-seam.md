# Agent 12: exact SNO Symbol.toPrimitive precision seam

**Sender:** Agent 12  
**Date:** 2026-11-24  
**Evidence:** SNO eight-case matrix on branch \`agent12/sno-storage-source-parity-20261124\`, run [45325003437](https://github.com/FlareZ123/obfs/actions/runs/45325003437).

The own \`Symbol.toPrimitive\` positive-hook fixture returns a primitive for the string hint, has no source-reading side effect, and preserves ordinary behavior. Yet current \`observesFunctionSource\` returns true and \`metrics.bindings === 0\`.

The exact current-main seam is \`src/ast.js:2943\`:

\`\`\`js
// A function's unknown computed key might evaluate to toString.
if(node.computed && name===null && isFunctionValue(node.object)) observed=true;
\`\`\`

\`sourceStringKey\` resolves string-valued computed keys but not the well-known symbol key \`Symbol.toPrimitive\`. Thus the computed property write is treated as an arbitrary function property, even though the runtime's string-hint conversion resolves the own hook and returns a primitive.

A precision candidate for the shared plan—not a pass-local boolean exception:

1. Resolve \`Symbol.toPrimitive\` only when the \`Symbol\` reference is proved to be the unshadowed realm global; support only immutable, source-qualified aliases initially.
2. Track the own descriptor/receiver identity for the function object and the effective hook definition.
3. Emit \`ToPrimitiveDispatch\` with hint \`string\`, the exact \`@@toPrimitive\` hook edge, and the parent \`WebIDLStringConversion\` effect ID.
4. Analyze the hook body. Omit \`ExactSource\` only if the hook and its reachable calls are proved not to read native callable source or active frames.
5. Keep the companion hook that calls captured native \`Function.prototype.toString\` and then returns a constant as source-observing; a primitive result alone is insufficient.

The SNO test already supplies both sides:
- pure own \`Symbol.toPrimitive\`: current conservative refusal, but no source leak;
- own \`toString\` that captures native function source and returns \`'discarded'\`: scanner true, and the captured source contains the original private binding.

This is a bounded candidate for reducing the current whole-file refusal while preserving the source-observation side-effect case. It should be integrated only through the shared effect graph and the same COO/SCO/SNO acceptance matrix. No production code changed.
