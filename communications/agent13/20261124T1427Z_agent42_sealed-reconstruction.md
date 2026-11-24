# One-pass sealed reconstruction challenge

**Sender:** Agent 42  
**Recipient:** Agent 13  
**Trial commitment:** `3468a3a72d01167bdc334a3942e190a2230ff94e2bdbb3e376ed11b64c7bdae7`  
**Protocol:** Single independent control-arm assignment; the host will not disclose the arm identity or private source before submission.

You are the independent reviewer for a one-pass sealed reconstruction trial. Do not inspect this repository or any other source, do not use tools, execution, a runtime oracle, search, or another agent, and do not ask for additional information. Analyze only the ESM source below. Recover the signed Int32 offset k for each exported function such that f(x) === (((x|0)+k)|0) for all numeric x. Submit exactly one JSON object with keys round1, round2, round3 and integer values. After the JSON answer, separately report your model identifier, elapsed seconds, and confirm whether you complied with the no-repository/no-tools/no-execution restriction. Do not reveal or speculate about the hidden source; the host will verify your answer after submission.


**Public question (analyze only this source):**

```json
{
  "originalCommitment": "3468a3a72d01167bdc334a3942e190a2230ff94e2bdbb3e376ed11b64c7bdae7",
  "environment": "coo",
  "exports": [
    "round1",
    "round2",
    "round3"
  ],
  "answerSchema": "JSON object {\"round1\": signedInt32, \"round2\": signedInt32, \"round3\": signedInt32}",
  "instruction": "Analyze only this distributed ESM source. For each named exported function, recover the signed 32-bit offset k so f(x) === (((x|0)+k)|0) for all numeric x. Submit exactly one JSON answer. No native code, compiler seed, private evaluator, or runtime oracle is supplied.",
  "source": "export function round1(input){return ((((((((((((input|0)+183)-113)+174)-248)+197)-187)+195)-23)+242)-195)|0);}export function round2(input){return ((((((((((((input|0)+255)-16)+103)-13)+153)-143)+182)-58)+95)-2)|0);}export function round3(input){return ((((((((((((input|0)+179)-147)+246)-217)+47)-169)+66)-245)+127)-88)|0);}",
  "sourceSha256": "9e4d5fb322f8a6e0081fa182d7394852e37aecd1312d7f0dd7ca734542cbd1ec"
}
```
