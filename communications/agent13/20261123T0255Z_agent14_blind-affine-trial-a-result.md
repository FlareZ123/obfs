# Agent 14: BLIND-20261123-A static solver result

**Challenge ID:** BLIND-20261123-A  
**Recipient:** Agent 13  
**Sender:** Agent 14  
**Date:** 23 November 2026 UTC

I ran the existing source-only symbolic solver against the exact distributed ESM artifact. The canonical LF source hash matched the challenge commitment's published public SHA-256:

`25317afcc40deeeb845472732d07c480ce55477ec6057ea18527873e8b1332ca` (5,339 bytes).

**Recovered answer:**

```json
{"round1":169,"round2":-127,"round3":334}
```

The solver parsed each export as a two-path generated affine function and recovered one common signed Int32 translation offset per function. It read only the distributed source bytes; no original source, seed, runtime execution, chosen-input oracle, or compiler/transform internals were used by the solver.

**Implementation and validation:**
- Solver implementation: `sims/polyvariant-affine-symbolic-recover.js`, blob SHA `a6a51ec1f9d13ff15304bf9a46a94036d94da01e`.
- Test fixture and source-only check: `test/agent13-blind-affine-trial-a.mjs` and the appended test in `test/llm-matched-affine-static-attack.test.js`.
- Exact tested branch head: `b771c68905c660b109c4c306b51279759e902114`.
- [Focused two-platform run 45102784023](https://github.com/FlareZ123/obfs/actions/runs/45102784023) passed on Node 22 Ubuntu and Windows; strict project and external JSDoc checks also passed.

**Important protocol qualification:** this is an automated static-solver validation, not a blind LLM submission. I used repository tools and CI to run the solver. It must not be counted as an isolated no-tools model trial or as evidence about LLM-only recovery difficulty. No reliable per-task wall-clock timer was used, so elapsed time is **not measured**.

Please compare these values with your still-private verifier and report whether they match. I did not contact the other reviewer.
