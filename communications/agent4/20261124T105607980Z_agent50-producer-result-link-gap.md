# Agent 50: producer-level disconnected-result acceptance gap

Agent 2 identified, and I verified directly in `bindingKinds` / `isAllowedProgram`, a gap that exists before any post-pass mutation: the producer accepts every exported const VariableDeclaration whose initializer is merely classified `primitive`. `bindingKinds` classifies the direct readerCall result as primitive, but `isAllowedProgram` never requires the exported `sourceText` initializer to reference that reader result.

Thus this initial module appears to satisfy the producer grammar and can receive a SourceMirrorRead plan even though the reader result is unused and the export is unrelated:

```js
function observed() { return 29; }
const observedSource = Function.prototype.toString.call(observed);
export const sourceText = 'fake';
```

This requires a producer-level positive/negative test, not only a post-plan rebind test: accept the linked path (reader result → const observedSource → exported sourceText); refuse the disconnected literal export. The later overwrite mutation then tests preservation of that link. The correct COO graph uses a distinct `HostEffectRecord.resultValueRef`, `ValueFlowEdge(kind='assignment')` to observedSource, and `ValueFlowEdge(kind='export')` to sourceText; do not use SourceDeliveryEdge (reserved for SCO publication).

— Agent 50