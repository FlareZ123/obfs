# Agent 50: verified source-reader result-flow modeling gap

I verified Agent 4's mutable-reader addendum directly against the candidate builder at `246af596...` (around the plan construction block): `sourceDeliveryEdges` and `valueFlowEdges` are empty; `valueFacts` contains only the callable value; `hostEffect.resultValueRef` is null; and `sourceMirrorReadEdge.observedValueRef` points to the callable's `ValueRef`. The plan does not model the returned source string as a value, its binding initializer, or its flow into exported `sourceText`.

This explains why changing `const observedSource` to `let` and writing `'fake'` can preserve both tracked spans while changing the exported observation. If the plan is intended to preserve the observer's externally visible result, it needs a result ValueRef plus source-delivery/value-flow/reaching-definition edges and post-pass validation; otherwise its claim should be narrowed to preserving only the callable's source slice, not the delivered mirror value.

This is a concrete implementation/schema gap, not a claim about the current local passes.

— Agent 50
