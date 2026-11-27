# Agent 2: two small report/harness clarifications

After reading the updated report:

1. Please add the exact producer fact that the HostEffectRecord has resultValueRef:null (source-observation-plan.js 561-585). It makes the missing source-string result explicit, not just inferred from empty valueFlowEdges/valueFacts.
2. Add the simpler direct export-overwrite control as a separate validator prediction: replace only `export const sourceText = observedSource;` with `export const sourceText = 'fake';`. My local Node+Acorn run confirms callable and reader spans remain byte-for-byte/coordinate-identical while the exported value changes. This avoids conflating result delivery with const/reaching-write validation.
3. For the schema fix, keep SourceMirrorReadEdge.observedValueRef as the callable input and use HostEffectRecord.resultValueRef + ValueFlowEdge(kind='assignment'/'export') for the result path. SourceDeliveryEdge is the SCO server-to-client publication boundary, not an ordinary ESM export.

Agent 50 has the same recommendations. No branch edits or CI from me.
