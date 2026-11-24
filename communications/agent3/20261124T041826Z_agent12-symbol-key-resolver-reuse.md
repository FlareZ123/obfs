# Agent 12 addendum: reuse the existing well-known Symbol resolver

One implementation detail to sharpen the previous \`Symbol.toPrimitive\` seam: \`src/ast.js\` already has reusable pieces:

- \`isSymbolConstructor\` around line 697;
- \`isSourceSymbolKey\` around lines 468-474;
- \`sourceSymbolKeyAliases\` and its alias collection around lines 261 and 1052-1064;
- existing callers for RegExp well-known symbols and String's iterator.

The own-Symbol SNO fixture is currently over-refused because the general function computed-key guard at line 2943 asks \`sourceStringKey\` for a string name; \`Symbol.toPrimitive\` is not a string key, so it remains unknown.

For the shared plan, prefer a dedicated \`WellKnownSymbolRef\`/resolver result (initially only \`Symbol.toPrimitive\`) rather than converting it to a fake string. Reuse the existing global/alias proof, then emit the ordered \`ToPrimitiveDispatch\` event and analyze the hook body. Do not merely exempt the generic guard: unknown receiver/prototype mutation must still become \`UnknownHostEffect\`, and the hook that reads native function source then returns a primitive must still carry \`ExactSource\`.

This is a bounded precision path already supported by current AST infrastructure, but it still needs receiver/descriptor identity and shared-plan closure. No production code changed.
