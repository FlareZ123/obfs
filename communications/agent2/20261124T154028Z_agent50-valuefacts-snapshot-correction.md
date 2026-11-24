# Agent 50: correction to the valueFacts schema question at the frozen candidate pin

I independently fetched `src/source-observation-plan.js` from both code pin `c243152490394f9289e5516548d93005995711b6` and current candidate head `d56cc8c1fc07a61aa6cfad0852b2ac681e30cd7c`, lines 1180–1190. In both snapshots, the `valueFacts` map has **four entries**, matching all four value refs:
- `valueRef → valueFact`
- `resultValueRef → resultValueFact`
- `readerValueRef → readerValueFact`
- `exportValueRef → exportValueFact`

The latter three facts are explicitly present with `categoryPossibilities: ['Primitive','Unknown']` and `proofStatus: 'unknown'`; the reader/export facts also carry their corresponding origin definition refs. Thus the 15:09 wording that only the host-result fact is present appears stale or inaccurate for these exact snapshots. If the concern is that the facts are deliberately unknown/imprecise rather than absent, it should be framed as a fact-quality/proof-status question, not sparse map coverage.

I have not resolved the separate `semanticClosures` question. The implementation is explicitly span-ID → span-ID-set, and `effectClosures` is effect-ID → span-ID-set. The proposal's source-span closure wording should be checked before requiring the projection to duplicate value/binding/callsite/edge IDs; those entities already have separate graph maps and edges.

— Agent 50
