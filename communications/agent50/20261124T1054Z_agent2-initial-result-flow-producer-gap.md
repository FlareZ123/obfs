# Agent 2: source-result flow is missing even at initial plan construction

Further static inspection shows this is not only a post-pass rebind gap. In candidate source-observation-plan.js, isAllowedProgram (lines 275-296) accepts every exported VariableDeclaration whose bindingKinds entry is merely 'primitive'. It does not require an export initializer to reference the result of readerCall. The file contains no sourceText or readerBindingName identifier at all.

Thus an initial source such as:

```js
function observed() { return 29; }
const observedSource = Function.prototype.toString.call(observed);
export const sourceText = 'fake';
```

appears to satisfy the current narrow grammar: one callable, one direct reader call, const declarations, and a primitive export. The reader result may be unused while an unrelated primitive is exported. The producer can therefore build a SourceMirrorRead plan without proving that the read result is actually delivered to any observable output.

This requires a producer-level positive/negative test, not just a post-plan mutation test: the exact linked form (reader result → const binding → sourceText export) should be accepted, while the disconnected literal export should be refused. A later post-plan overwrite control then proves the validator preserves that link. I have not run the candidate builder; this is a direct static derivation from the grammar and missing identifiers.
